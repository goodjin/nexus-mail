use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce
};
use pbkdf2::pbkdf2;
use rand::Rng;
use sha2::Sha256;
use hmac::Hmac;
use std::collections::HashMap;
use std::fs;
use std::path::{PathBuf};
use anyhow::{Result, Context, anyhow};
use serde::{Serialize, Deserialize};
use base64::{Engine as _, engine::general_purpose::STANDARD};

pub struct SecurityService;

#[derive(Serialize, Deserialize)]
struct EncryptedStore {
    nonce: String, // Base64
    ciphertext: String, // Base64
}

impl SecurityService {
    const STORE_FILENAME: &'static str = "credentials.enc";
    const SALT: &'static [u8] = b"nexus-mail-salt-2026";

    /// 获取存储文件的路径
    fn get_store_path() -> Result<PathBuf> {
        let home = dirs::home_dir().ok_or_else(|| anyhow!("Failed to get home dir"))?;
        let config_dir = home.join(".nexus-mail");
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)?;
        }
        Ok(config_dir.join(Self::STORE_FILENAME))
    }

    /// 派生主密钥 (Master Key)
    fn derive_master_key() -> Result<[u8; 32]> {
        let username = whoami::username()?;
        let mut key = [0u8; 32];
        // 使用 Hmac<Sha256> 作为 PRF
        let _ = pbkdf2::<Hmac<Sha256>>(
            username.as_bytes(),
            Self::SALT,
            100_000,
            &mut key
        );
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
        
        let ciphertext = cipher.encrypt(nonce, json.as_ref())
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
        
        let decrypted = cipher.decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| anyhow!("Decryption error: {}. Master key mismatch?", e))?;
        
        let store: HashMap<String, String> = serde_json::from_slice(&decrypted)?;
        Ok(store)
    }

    pub fn set_password(email: &str, password: &str) -> Result<()> {
        let mut store = Self::load_store().unwrap_or_default();
        store.insert(email.to_string(), password.to_string());
        Self::save_store(&store)
    }

    pub fn get_password(email: &str) -> Result<String> {
        let store = Self::load_store()?;
        store.get(email)
            .cloned()
            .ok_or_else(|| anyhow!("Password not found for {}", email))
    }

    pub fn delete_password(email: &str) -> Result<()> {
        let mut store = Self::load_store().unwrap_or_default();
        store.remove(email);
        Self::save_store(&store)
    }

    pub fn get_or_create_db_key() -> Result<String> {
        match Self::get_password("db_encryption_key") {
            Ok(key) => Ok(key),
            Err(_) => {
                let new_key = uuid::Uuid::new_v4().to_string();
                Self::set_password("db_encryption_key", &new_key)?;
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
}
