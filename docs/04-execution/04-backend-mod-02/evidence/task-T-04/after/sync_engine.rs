use super::database::Database;
use super::traits::MailClient;
use anyhow::{Context, Result};
use std::collections::HashSet;

#[derive(Clone)]
pub struct SyncEngine {
    db: Database,
}

impl SyncEngine {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// 初始同步账户信息与文件夹结构
    pub async fn init_sync<C: MailClient>(
        &self,
        client: &mut C,
        email: &str,
        imap_host: &str,
        imap_port: u16,
        imap_use_tls: bool,
        smtp_host: &str,
        smtp_port: u16,
        smtp_use_tls: bool,
    ) -> Result<String> {
        let account_id = self
            .db
            .upsert_account(
                email,
                None,
                imap_host,
                imap_port,
                imap_use_tls,
                smtp_host,
                smtp_port,
                smtp_use_tls,
            )
            .await
            .context("Failed to upsert account during sync")?;

        client.connect().await?;

        let folders = client
            .get_folders()
            .await
            .context("Failed to fetch folders from client")?;
        
        let mut remote_ids = HashSet::new();
        for folder in &folders {
            remote_ids.insert(folder.remote_id.clone());
            self.db
                .upsert_folder(
                    &account_id,
                    &folder.remote_id,
                    &folder.name,
                    folder.unread_count,
                    folder.system_role.as_deref(),
                )
                .await
                .context("Failed to persist folder")?;
        }

        // Prune orphaned folders
        let local_folders = self.db.get_folders_for_account(&account_id).await?;
        for local in local_folders {
            if !remote_ids.contains(&local.remote_id) {
                println!("[Sync] Pruning orphaned folder: {} ({})", local.name, local.remote_id);
                if let Err(e) = self.db.delete_folder(&local.id).await {
                    crate::error!("Failed to prune folder {}: {}", local.id, e);
                }
            }
        }

        Ok(account_id)
    }

    /// 执行邮件内容的增量同步
    pub async fn sync_emails<C: MailClient>(
        &self,
        client: &mut C,
        folder_id: &str,
        folder_remote_id: &str,
    ) -> Result<usize> {
        // 1. 获取本地数据库中该文件夹最后一条邮件的 UID
        let last_uid = self
            .db
            .get_last_uid(folder_id)
            .await
            .context("Failed to fetch last UID from database")?;

        // 2. 抓取该 UID 之后的邮件（首次同步则拉取最新批次）
        let new_emails = if last_uid == 0 {
            match client.get_emails(folder_remote_id, 200).await {
                Ok(emails) => emails,
                Err(e) => {
                    crate::error!("Initial sync failed for folder {}: {}", folder_remote_id, e);
                    return Err(e).context("Failed to fetch initial emails from client");
                }
            }
        } else {
            match client.get_emails_since(folder_remote_id, last_uid).await {
                Ok(emails) => emails,
                Err(e) => {
                    crate::error!("Sync failed for folder {}: {}", folder_remote_id, e);
                    return Err(e).context("Failed to fetch new emails from client");
                }
            }
        };

        let count = new_emails.len();

        // 3. 存储邮件
        for email in new_emails {
            self.store_synced_email(folder_id, &email).await?;
        }

        // 更新未读数
        self.db.update_folder_unread_count(folder_id).await?;

        Ok(count)
    }

    /// 清理本地数据库中在远程已删除的邮件
    pub async fn prune_deleted_emails<C: MailClient>(
        &self,
        client: &mut C,
        folder_id: &str,
        folder_remote_id: &str,
    ) -> Result<usize> {
        client.select_folder(folder_remote_id).await?;
        
        let last_uid = self.db.get_last_uid(folder_id).await?;
        if last_uid == 0 {
            return Ok(0);
        }
        let mut first_uid = self.db.get_first_uid(folder_id).await?;
        if first_uid == 0 {
            first_uid = last_uid;
        }
        let mut fetch_limit = last_uid
            .saturating_sub(first_uid)
            .saturating_add(1) as usize;
        if fetch_limit < 50 {
            fetch_limit = 50;
        }
        if fetch_limit > 1000 {
            fetch_limit = 1000;
        }
        let remote_emails = client.get_emails(folder_remote_id, fetch_limit).await?;
        let mut remote_uids = HashSet::new();
        for email in remote_emails {
            if let Ok(uid) = email.uid.parse::<u32>() {
                remote_uids.insert(uid);
            }
        }
        if remote_uids.is_empty() {
            return Ok(0);
        }
        let remote_min = *remote_uids.iter().min().unwrap();
        let remote_max = *remote_uids.iter().max().unwrap();

        // 2. 获取本地所有 UID
        let local_uids = self.db.get_all_uids_in_folder(folder_id).await?;

        // 3. 找出本地存在但远程不存在的（仅清理在远端窗口内的 UID）
        let to_delete: Vec<String> = local_uids
            .into_iter()
            .filter(|uid| {
                if let Ok(local_uid) = uid.parse::<u32>() {
                    if local_uid < remote_min || local_uid > remote_max {
                        return false;
                    }
                    return !remote_uids.contains(&local_uid);
                }
                false
            })
            .collect();

        let count = to_delete.len();
        for uid in to_delete {
            self.db.delete_email_by_uid(folder_id, &uid).await?;
        }
        self.db.update_folder_unread_count(folder_id).await?;

        Ok(count)
    }

    /// 执行一轮历史邮件同步（向后抓取）
    pub async fn sync_history_step<C: MailClient>(
        &self,
        client: &mut C,
        folder_id: &str,
        folder_remote_id: &str,
        batch_size: usize,
    ) -> Result<usize> {
        // 1. 检查设置
        let sync_enabled = self.db.get_setting("background_sync_history").await?
            .map(|v| v == "true")
            .unwrap_or(true); 
        
        if !sync_enabled {
            return Ok(0);
        }

        // 2. 获取当前本地最旧的邮件 UID
        let first_uid = self.db.get_first_uid(folder_id).await?;
        if first_uid <= 1 {
            return Ok(0); 
        }

        // 3. 抓取之前的邮件
        let old_emails = client
            .get_emails_before(folder_remote_id, first_uid, batch_size)
            .await?;
        
        let count = old_emails.len();
        for email in old_emails {
            self.store_synced_email(folder_id, &email).await?;
        }
        if count > 0 {
            self.db.update_folder_unread_count(folder_id).await?;
        }

        Ok(count)
    }

    async fn store_synced_email(&self, folder_id: &str, email: &super::traits::EmailSummary) -> Result<()> {
        if let Some(msg_id) = &email.message_id {
            if let Ok(Some(local_uid)) = self.db.find_email_by_message_id(folder_id, msg_id).await {
                if local_uid.starts_with("local-sent-") {
                    let _ = self.db.update_remote_id(folder_id, &local_uid, &email.uid).await;
                }
            }
        }
        self.db.upsert_email(folder_id, email).await.context("Failed to upsert email during sync")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::mock_client::MockMailClient;
    use sqlx::SqlitePool;

    #[tokio::test]
    async fn test_incremental_sync_with_mock() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let engine = SyncEngine::new(db);
        let mut mock_client = MockMailClient::new();

        // 1. 模拟初始同步账户和文件夹
        let acct_id = engine
            .init_sync(
                &mut mock_client,
                "test@me.com",
                "imap.test.com",
                993,
                true,
                "smtp.test.com",
                465,
                true,
            )
            .await
            .unwrap();

        // 获取生成的文件夹 ID
        let res: (String, String) = sqlx::query_as("SELECT id, remote_id FROM folders LIMIT 1")
            .fetch_one(&engine.db.pool)
            .await
            .unwrap();
        let folder_id = res.0;
        let remote_id = res.1;

        // 2. 第一次同步邮件 (Mock 会返回初始邮件)
        // 注意：首次同步会走 get_emails，Mock 返回 2 封邮件
        let synced_count = engine
            .sync_emails(&mut mock_client, &folder_id, &remote_id)
            .await
            .unwrap();
        assert_eq!(synced_count, 2);

        // 3. 再次同步，last_uid 应该增加了，验证是否能继续抓取
        let last_uid = engine.db.get_last_uid(&folder_id).await.unwrap();
        assert!(last_uid > 0);
    }

    #[tokio::test]
    async fn test_sync_no_new_emails() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();
        let engine = SyncEngine::new(db.clone());

        let acct_id = db
            .upsert_account("test@me.com", None, "host", 993, true, "host", 465, true)
            .await
            .unwrap();
        let folder_id = db
            .upsert_folder(&acct_id, "INBOX", "Inbox", 0, Some("INBOX"))
            .await
            .unwrap();

        // 模拟没有新邮件的 Client
        struct EmptyClient;
        #[async_trait::async_trait]
        impl MailClient for EmptyClient {
            async fn connect(&mut self) -> Result<()> {
                Ok(())
            }
            async fn login(&mut self, _: &str, _: &str) -> Result<()> {
                Ok(())
            }
            async fn get_folders(&mut self) -> Result<Vec<crate::core::traits::FolderInfo>> {
                Ok(vec![])
            }
            async fn select_folder(&mut self, _: &str) -> Result<()> {
                Ok(())
            }
            async fn get_emails(
                &mut self,
                _: &str,
                _: usize,
            ) -> Result<Vec<crate::core::traits::EmailSummary>> {
                Ok(vec![])
            }
            async fn get_emails_since(
                &mut self,
                _: &str,
                _: u32,
            ) -> Result<Vec<crate::core::traits::EmailSummary>> {
                Ok(vec![])
            }
            async fn get_emails_before(
                &mut self,
                _: &str,
                _: u32,
                _: usize,
            ) -> Result<Vec<crate::core::traits::EmailSummary>> {
                Ok(vec![])
            }
            async fn append_message(&mut self, _: &str, _: &[u8]) -> Result<()> {
                Ok(())
            }
            async fn get_email_details(
                &mut self,
                _: &str,
                uid: &str,
            ) -> Result<crate::core::traits::EmailDetails> {
                Ok(crate::core::traits::EmailDetails {
                    uid: uid.to_string(),
                    body_html: None,
                    body_text: None,
                    attachments: vec![],
                })
            }
            async fn get_attachment(&mut self, _: &str, _: &str, _: &str) -> Result<Vec<u8>> {
                Ok(vec![])
            }
            async fn set_flag(&mut self, _: &str, _: &str, _: &str, _: bool) -> Result<()> {
                Ok(())
            }
            async fn delete_email(&mut self, _: &str, _: &str) -> Result<()> {
                Ok(())
            }
            async fn idle(&mut self, _: &str) -> Result<()> {
                Ok(())
            }
        }

        let mut client = EmptyClient;
        let count = engine
            .sync_emails(&mut client, &folder_id, "INBOX")
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
}
