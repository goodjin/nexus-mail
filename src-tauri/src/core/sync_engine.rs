use super::traits::MailClient;
use super::database::Database;
use anyhow::{Result, Context};

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
        smtp_host: &str,
        smtp_port: u16
    ) -> Result<String> {
        let account_id = self.db.upsert_account(
            email, 
            None, 
            imap_host, 
            imap_port, 
            smtp_host, 
            smtp_port
        ).await.context("Failed to upsert account during sync")?;

        client.connect().await?;

        let folders = client.get_folders().await.context("Failed to fetch folders from client")?;
        for folder in folders {
            self.db.upsert_folder(
                &account_id, 
                &folder.remote_id, 
                &folder.name, 
                folder.unread_count
            ).await.context("Failed to persist folder")?;
        }

        Ok(account_id)
    }

    /// 执行邮件内容的增量同步
    pub async fn sync_emails<C: MailClient>(
        &self,
        client: &mut C,
        folder_id: &str,
        folder_remote_id: &str
    ) -> Result<usize> {
        // 1. 获取本地数据库中该文件夹最后一条邮件的 UID
        let last_uid = self.db.get_last_uid(folder_id).await
            .context("Failed to fetch last UID from database")?;
        
        // 2. 抓取该 UID 之后的邮件
        let new_emails = client.get_emails_since(folder_remote_id, last_uid).await
            .context("Failed to fetch new emails from client")?;
        
        let count = new_emails.len();
        
        // 3. 存储邮件
        for email in new_emails {
            self.db.upsert_email(folder_id, &email).await
                .context(format!("Failed to persist email UID: {}", email.uid))?;
        }
        
        Ok(count)
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
        let acct_id = engine.init_sync(&mut mock_client, "test@me.com", "imap.test.com", 993, "smtp.test.com", 465).await.unwrap();
        
        // 获取生成的文件夹 ID
        let res: (String, String) = sqlx::query_as("SELECT id, remote_id FROM folders LIMIT 1")
            .fetch_one(&engine.db.pool).await.unwrap();
        let folder_id = res.0;
        let remote_id = res.1;

        // 2. 第一次同步邮件 (Mock 会返回初始邮件)
        // 注意：Mock 目前 get_emails_since 返回 1 封邮件
        let synced_count = engine.sync_emails(&mut mock_client, &folder_id, &remote_id).await.unwrap();
        assert_eq!(synced_count, 1);

        // 3. 再次同步，last_uid 应该增加了，验证是否能继续抓取
        let last_uid = engine.db.get_last_uid(&folder_id).await.unwrap();
        assert!(last_uid > 0);
    }

    #[tokio::test]
    async fn test_sync_no_new_emails() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();
        let engine = SyncEngine::new(db);
        
        let acct_id = db.upsert_account("test@me.com", None, "host", 993, "host", 465).await.unwrap();
        let folder_id = db.upsert_folder(&acct_id, "INBOX", "Inbox", 0).await.unwrap();
        
        // 模拟没有新邮件的 Client
        struct EmptyClient;
        #[async_trait::async_trait]
        impl MailClient for EmptyClient {
            async fn connect(&mut self) -> Result<()> { Ok(()) }
            async fn login(&mut self, _: &str, _: &str) -> Result<()> { Ok(()) }
            async fn get_folders(&mut self) -> Result<Vec<crate::core::traits::FolderInfo>> { Ok(vec![]) }
            async fn select_folder(&mut self, _: &str) -> Result<()> { Ok(()) }
            async fn get_emails(&mut self, _: &str, _: usize) -> Result<Vec<crate::core::traits::EmailSummary>> { Ok(vec![]) }
            async fn get_emails_since(&mut self, _: &str, _: u32) -> Result<Vec<crate::core::traits::EmailSummary>> { Ok(vec![]) }
            async fn get_email_details(&mut self, _: &str, _: &str) -> Result<crate::core::traits::EmailDetails> { todo!() }
        }

        let mut client = EmptyClient;
        let count = engine.sync_emails(&mut client, &folder_id, "INBOX").await.unwrap();
        assert_eq!(count, 0);
    }
}
