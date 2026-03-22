use sqlx::{sqlite::SqlitePool, Row};
use anyhow::{Result, Context};
use std::path::Path;

#[derive(Clone)]
pub struct Database {
    pub pool: SqlitePool,
}

impl Database {
    pub async fn new(app_dir: &Path, key: &str) -> Result<Self> {
        let db_path = app_dir.join("nexus.db");
        println!("[DB] Attempting to connect to: {}", db_path.display());
        
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);

        let pool = SqlitePool::connect_with(options).await
            .with_context(|| format!("Failed to connect to database at {}", db_path.display()))?;
        
        println!("[DB] Connection established, setting PRAGMA key");
        // 如果底层集成了 SQLCipher，PRAGMA key 会生效
        sqlx::query(&format!("PRAGMA key = '{}'", key)).execute(&pool).await
            .context("Failed to set encryption key. Ensure SQLCipher is supported.")?;

        let db = Self { pool };
        db.init_tables().await?;
        Ok(db)
    }

    pub async fn init_tables(&self) -> Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                display_name TEXT,
                imap_host TEXT NOT NULL,
                imap_port INTEGER NOT NULL,
                smtp_host TEXT NOT NULL,
                smtp_port INTEGER NOT NULL
            )"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                remote_id TEXT NOT NULL,
                name TEXT NOT NULL,
                unread_count INTEGER DEFAULT 0,
                UNIQUE(account_id, remote_id),
                FOREIGN KEY(account_id) REFERENCES accounts(id)
            )"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS emails (
                id TEXT PRIMARY KEY,
                folder_id TEXT NOT NULL,
                remote_id TEXT NOT NULL,
                subject TEXT,
                sender TEXT,
                date TEXT,
                snippet TEXT,
                body_text TEXT,
                body_html TEXT,
                UNIQUE(folder_id, remote_id),
                FOREIGN KEY(folder_id) REFERENCES folders(id)
            )"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
                id UNINDEXED,
                subject,
                sender,
                snippet,
                tokenize='unicode61'
            )"
        ).execute(&self.pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS attachments (
                id TEXT PRIMARY KEY,
                email_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                FOREIGN KEY(email_id) REFERENCES emails(id)
            )"
        ).execute(&self.pool).await?;

        Ok(())
    }

    pub async fn upsert_account(&self, email: &str, display_name: Option<&str>, imap_host: &str, imap_port: u16, smtp_host: &str, smtp_port: u16) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO accounts (id, email, display_name, imap_host, imap_port, smtp_host, smtp_port)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET
                display_name = excluded.display_name,
                imap_host = excluded.imap_host,
                imap_port = excluded.imap_port,
                smtp_host = excluded.smtp_host,
                smtp_port = excluded.smtp_port
             RETURNING id"
        )
        .bind(&id)
        .bind(email)
        .bind(display_name)
        .bind(imap_host)
        .bind(imap_port as i64)
        .bind(smtp_host)
        .bind(smtp_port as i64)
        .fetch_one(&self.pool)
        .await
        .map(|row| row.get::<String, _>(0))
        .context("Failed to upsert account")
    }

    pub async fn upsert_folder(&self, account_id: &str, remote_id: &str, name: &str, unread_count: u32) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO folders (id, account_id, remote_id, name, unread_count)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(account_id, remote_id) DO UPDATE SET
                name = excluded.name,
                unread_count = excluded.unread_count
             RETURNING id"
        )
        .bind(&id)
        .bind(account_id)
        .bind(remote_id)
        .bind(name)
        .bind(unread_count as i64)
        .fetch_one(&self.pool)
        .await
        .map(|row| row.get::<String, _>(0))
        .context("Failed to upsert folder")
    }

    pub async fn upsert_email(&self, folder_id: &str, summary: &super::traits::EmailSummary) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let mut tx = self.pool.begin().await?;

        let email_id: String = sqlx::query(
            "INSERT INTO emails (id, folder_id, remote_id, subject, sender, date, snippet)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(folder_id, remote_id) DO UPDATE SET
                subject = excluded.subject,
                sender = excluded.sender,
                date = excluded.date,
                snippet = excluded.snippet
             RETURNING id"
        )
        .bind(&id)
        .bind(folder_id)
        .bind(&summary.uid)
        .bind(&summary.subject)
        .bind(&summary.from)
        .bind(&summary.date)
        .bind(&summary.snippet)
        .fetch_one(&mut *tx)
        .await
        .map(|row| row.get::<String, _>(0))?;

        sqlx::query("DELETE FROM emails_fts WHERE id = ?").bind(&email_id).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO emails_fts (id, subject, sender, snippet) VALUES (?, ?, ?, ?)")
            .bind(&email_id)
            .bind(&summary.subject)
            .bind(&summary.from)
            .bind(&summary.snippet)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(email_id)
    }

    pub async fn search_emails(&self, query: &str) -> Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT id FROM emails_fts WHERE emails_fts MATCH ? ORDER BY rank"
        )
        .bind(query)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    pub async fn get_last_uid(&self, folder_id: &str) -> Result<u32> {
        let res: Option<(i64,)> = sqlx::query_as("SELECT MAX(CAST(remote_id AS INTEGER)) FROM emails WHERE folder_id = ?")
            .bind(folder_id)
            .fetch_optional(&self.pool)
            .await?;
        
        Ok(res.map(|(uid,)| uid as u32).unwrap_or(0))
    }

    pub async fn get_account_by_email(&self, email: &str) -> Result<Option<AccountInfo>> {
        sqlx::query_as("SELECT * FROM accounts WHERE email = ?")
            .bind(email)
            .fetch_optional(&self.pool)
            .await
            .map_err(Into::into)
    }

    pub async fn get_folders_by_account(&self, account_id: &str) -> Result<Vec<FolderInfo>> {
        sqlx::query_as("SELECT * FROM folders WHERE account_id = ?")
            .bind(account_id)
            .fetch_all(&self.pool)
            .await
            .map_err(Into::into)
    }
}

#[derive(sqlx::FromRow)]
pub struct AccountInfo {
    pub id: String,
    pub email: String,
    pub imap_host: String,
    pub imap_port: i64,
    pub smtp_host: String,
    pub smtp_port: i64,
}

#[derive(sqlx::FromRow)]
pub struct FolderInfo {
    pub id: String,
    pub remote_id: String,
    pub name: String,
    pub unread_count: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_db_initialization() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        // 内存数据库通常不支持 SQLCipher，除非特殊编译。此处仅测试逻辑。
        let db = Database { pool };
        db.init_tables().await.unwrap();
    }

    #[tokio::test]
    async fn test_upsert_logic() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db.upsert_account("test@test.com", None, "host", 993, "host", 465).await.unwrap();
        assert!(!acct_id.is_empty());

        let folder_id = db.upsert_folder(&acct_id, "INBOX", "Inbox", 10).await.unwrap();
        assert!(!folder_id.is_empty());

        // 测试更新
        let folder_id_2 = db.upsert_folder(&acct_id, "INBOX", "Updated Inbox", 12).await.unwrap();
        assert_eq!(folder_id, folder_id_2);
    }

    #[tokio::test]
    async fn test_fts_search() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db.upsert_account("search@test.com", None, "host", 993, "host", 465).await.unwrap();
        let folder_id = db.upsert_folder(&acct_id, "INBOX", "Inbox", 0).await.unwrap();

        let email = crate::core::traits::EmailSummary {
            uid: "100".into(),
            subject: "Rust Programming Language".into(),
            from: "rust@rust-lang.org".into(),
            date: "2026-01-01".into(),
            snippet: "This is a book about Rust.".into(),
        };
        db.upsert_email(&folder_id, &email).await.unwrap();

        let results = db.search_emails("Rust").await.unwrap();
        assert_eq!(results.len(), 1);

        let results_none = db.search_emails("Java").await.unwrap();
        assert_eq!(results_none.len(), 0);
    }

    #[tokio::test]
    async fn test_multi_account_isolation() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct1 = db.upsert_account("user1@test.com", None, "host", 993, "host", 465).await.unwrap();
        let acct2 = db.upsert_account("user2@test.com", None, "host", 993, "host", 465).await.unwrap();

        let folder1 = db.upsert_folder(&acct1, "INBOX", "Inbox", 0).await.unwrap();
        let folder2 = db.upsert_folder(&acct2, "INBOX", "Inbox", 0).await.unwrap();

        assert_ne!(folder1, folder2);

        let email1 = crate::core::traits::EmailSummary {
            uid: "1".into(),
            subject: "Msg 1".into(),
            from: "a@a.com".into(),
            date: "now".into(),
            snippet: "s1".into(),
        };
        db.upsert_email(&folder1, &email1).await.unwrap();

        let email2 = crate::core::traits::EmailSummary {
            uid: "1".into(), // Same UID but in different folder/account
            subject: "Msg 2".into(),
            from: "b@b.com".into(),
            date: "now".into(),
            snippet: "s2".into(),
        };
        db.upsert_email(&folder2, &email2).await.unwrap();

        // 验证同步引擎获取到的 UID 是隔离的
        assert_eq!(db.get_last_uid(&folder1).await.unwrap(), 1);
        assert_eq!(db.get_last_uid(&folder2).await.unwrap(), 1);
        
        // 验证全文搜索结果包含两条记录
        let search_results = db.search_emails("Msg").await.unwrap();
        assert_eq!(search_results.len(), 2);
    }
}
