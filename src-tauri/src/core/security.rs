use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use hmac::Hmac;
use once_cell::sync::Lazy;
use pbkdf2::pbkdf2;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct SecurityService;
static STORE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Serialize, Deserialize)]
struct EncryptedStore {
    nonce: String,      // Base64
    ciphertext: String, // Base64
}

impl SecurityService {
    const STORE_FILENAME: &'static str = "credentials.enc";
    const SALT: &'static [u8] = b"nexus-mail-salt-2026";
    const DB_KEY_ID: &'static str = "system:db_encryption_key";

    /// 获取存储文件的路径
    fn get_store_path() -> Result<PathBuf> {
        let data_dir = dirs::data_dir().ok_or_else(|| anyhow!("Failed to get data dir"))?;
        let app_dir = data_dir.join("com.nexus.mail");
        if !app_dir.exists() {
            fs::create_dir_all(&app_dir)?;
        }
        Ok(app_dir.join(Self::STORE_FILENAME))
    }

    /// 派生主密钥 (Master Key)
    fn derive_master_key() -> Result<[u8; 32]> {
        let username = whoami::username()?;
        let mut key = [0u8; 32];
        // 使用 Hmac<Sha256> 作为 PRF
        let _ = pbkdf2::<Hmac<Sha256>>(username.as_bytes(), Self::SALT, 100_000, &mut key);
        Ok(key)
    }

    /// 加密并存储整个 HashMap
    fn save_store(store: &HashMap<String, String>) -> Result<()> {
        let json = serde_json::to_vec(store)?;
        let master_key = Self::derive_master_key()?;
        let cipher = Aes256Gcm::new_from_slice(&master_key)
            .map_err(|e| anyhow!("Cipher init error: {}", e))?;

        let mut nonce_bytes = [0u8; 12];
        rand::rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, json.as_ref())
            .map_err(|e| anyhow!("Encryption error: {}", e))?;

        let encrypted_data = EncryptedStore {
            nonce: STANDARD.encode(nonce_bytes),
            ciphertext: STANDARD.encode(ciphertext),
        };

        let path = Self::get_store_path()?;
        fs::write(path, serde_json::to_string(&encrypted_data)?)?;
        Ok(())
    }

    /// 加载并解密整个 HashMap
    fn load_store() -> Result<HashMap<String, String>> {
        let path = Self::get_store_path()?;
        if !path.exists() {
            return Ok(HashMap::new());
        }

        let data = fs::read_to_string(path)?;
        let encrypted: EncryptedStore = serde_json::from_str(&data)?;

        let nonce_bytes = STANDARD.decode(encrypted.nonce)?;
        let ciphertext = STANDARD.decode(encrypted.ciphertext)?;
        let master_key = Self::derive_master_key()?;

        let cipher = Aes256Gcm::new_from_slice(&master_key)
            .map_err(|e| anyhow!("Cipher init error: {}", e))?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        let decrypted = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| anyhow!("Decryption error: {}. Master key mismatch?", e))?;

        let store: HashMap<String, String> = serde_json::from_slice(&decrypted)?;
        Ok(store)
    }

    fn namespaced_key(namespace: &str, key: &str) -> String {
        format!("{}:{}", namespace, key)
    }

    fn get_secret_with_legacy(namespace: &str, key: &str) -> Result<String> {
        let store = Self::load_store()?;
        let namespaced_key = Self::namespaced_key(namespace, key);
        store
            .get(&namespaced_key)
            .or_else(|| store.get(key))
            .cloned()
            .ok_or_else(|| anyhow!("Secret not found for {}", namespaced_key))
    }

    pub fn set_secret(namespace: &str, key: &str, value: &str) -> Result<()> {
        let _guard = STORE_LOCK
            .lock()
            .map_err(|_| anyhow!("Credential store lock poisoned"))?;
        let mut store = Self::load_store()?;
        store.insert(Self::namespaced_key(namespace, key), value.to_string());
        Self::save_store(&store)
    }

    pub fn get_secret(namespace: &str, key: &str) -> Result<String> {
        let _guard = STORE_LOCK
            .lock()
            .map_err(|_| anyhow!("Credential store lock poisoned"))?;
        Self::get_secret_with_legacy(namespace, key)
    }

    pub fn delete_secret(namespace: &str, key: &str) -> Result<()> {
        let _guard = STORE_LOCK
            .lock()
            .map_err(|_| anyhow!("Credential store lock poisoned"))?;
        let mut store = Self::load_store()?;
        store.remove(&Self::namespaced_key(namespace, key));
        store.remove(key);
        Self::save_store(&store)
    }

    pub fn set_password(email: &str, password: &str) -> Result<()> {
        Self::set_secret("account", email, password)
    }

    pub fn get_password(email: &str) -> Result<String> {
        Self::get_secret("account", email).map_err(|_| anyhow!("Password not found for {}", email))
    }

    pub fn delete_password(email: &str) -> Result<()> {
        Self::delete_secret("account", email)
    }

    pub fn set_oauth_token(account_id: &str, token: &str) -> Result<()> {
        Self::set_secret("oauth", account_id, token)
    }

    pub fn get_oauth_token(account_id: &str) -> Result<String> {
        Self::get_secret("oauth", account_id)
    }

    pub fn delete_oauth_token(account_id: &str) -> Result<()> {
        Self::delete_secret("oauth", account_id)
    }

    pub fn get_or_create_db_key() -> Result<String> {
        match Self::get_secret("system", "db_encryption_key")
            .or_else(|_| Self::get_secret_with_legacy("system", Self::DB_KEY_ID))
        {
            Ok(key) => Ok(key),
            Err(_) => {
                let new_key = uuid::Uuid::new_v4().to_string();
                Self::set_secret("system", "db_encryption_key", &new_key)?;
                Ok(new_key)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_custom_security_ops() {
        let test_email = "test-custom@nexus-mail.local";
        let test_pass = "custom-password-123";

        // 1. 存储
        SecurityService::set_password(test_email, test_pass).unwrap();

        // 2. 读取验证
        let retrieved = SecurityService::get_password(test_email).unwrap();
        assert_eq!(retrieved, test_pass);

        // 3. 删除
        SecurityService::delete_password(test_email).unwrap();

        // 4. 再次读取应失败
        let result = SecurityService::get_password(test_email);
        assert!(result.is_err());
    }
    #[test]
    fn test_password_not_found() {
        let test_email = "non-existent@nexus-mail.local";
        let result = SecurityService::get_password(test_email);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Password not found"));
    }

    #[test]
    fn test_oauth_token_ops() {
        let account_id = "oauth-test@nexus-mail.local";
        let token = "oauth-token-123";

        SecurityService::set_oauth_token(account_id, token).unwrap();
        let retrieved = SecurityService::get_oauth_token(account_id).unwrap();
        assert_eq!(retrieved, token);

        SecurityService::delete_oauth_token(account_id).unwrap();
        assert!(SecurityService::get_oauth_token(account_id).is_err());
    }
}
