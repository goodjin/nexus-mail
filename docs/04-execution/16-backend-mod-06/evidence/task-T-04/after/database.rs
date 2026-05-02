use super::traits::{AccountInfo, FolderInfo};
use anyhow::{bail, Context, Result};
use sqlx::{sqlite::SqlitePool, Row};
use std::path::Path;

#[derive(Clone)]
pub struct Database {
    pub pool: SqlitePool,
}

const SETTING_AUTO_DOWNLOAD_ATTACHMENTS: &str = "auto_download_attachments";
const SETTING_BACKGROUND_SYNC_HISTORY: &str = "background_sync_history";
const SETTING_THEME_MODE: &str = "theme";
const SETTING_SHORTCUTS: &str = "shortcuts";

const DEFAULT_SETTINGS: [(&str, &str); 4] = [
    (SETTING_AUTO_DOWNLOAD_ATTACHMENTS, "false"),
    (SETTING_BACKGROUND_SYNC_HISTORY, "true"),
    (SETTING_THEME_MODE, "system"),
    (SETTING_SHORTCUTS, "{}"),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

impl ThemeMode {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "light" => Some(Self::Light),
            "dark" => Some(Self::Dark),
            "system" => Some(Self::System),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
            Self::System => "system",
        }
    }
}

impl Database {
    fn derive_security_mode(port: u16, use_tls: bool) -> &'static str {
        if use_tls {
            "TLS"
        } else if matches!(port, 143 | 587) {
            "STARTTLS"
        } else {
            "TLS"
        }
    }

    pub async fn new(app_dir: &Path, key: &str) -> Result<Self> {
        let db_path = app_dir.join("nexus.db");
        println!("[DB] Attempting to connect to: {}", db_path.display());

        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);

        let pool = SqlitePool::connect_with(options)
            .await
            .with_context(|| format!("Failed to connect to database at {}", db_path.display()))?;

        println!("[DB] Connection established, setting PRAGMA key");
        // 如果底层集成了 SQLCipher，PRAGMA key 会生效
        sqlx::query(&format!("PRAGMA key = '{}'", key))
            .execute(&pool)
            .await
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
                imap_use_tls BOOLEAN NOT NULL DEFAULT 1,
                imap_security TEXT NOT NULL DEFAULT 'TLS',
                smtp_host TEXT NOT NULL,
                smtp_port INTEGER NOT NULL,
                smtp_use_tls BOOLEAN NOT NULL DEFAULT 1,
                smtp_security TEXT NOT NULL DEFAULT 'TLS',
                auth_type TEXT NOT NULL DEFAULT 'PASSWORD'
            )",
        )
        .execute(&self.pool)
        .await?;

        // 兼容性：如果旧表没有这些列，尝试添加
        let _ = sqlx::query("ALTER TABLE accounts ADD COLUMN imap_use_tls BOOLEAN NOT NULL DEFAULT 1")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("ALTER TABLE accounts ADD COLUMN imap_security TEXT NOT NULL DEFAULT 'TLS'")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("ALTER TABLE accounts ADD COLUMN smtp_use_tls BOOLEAN NOT NULL DEFAULT 1")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("ALTER TABLE accounts ADD COLUMN smtp_security TEXT NOT NULL DEFAULT 'TLS'")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("ALTER TABLE accounts ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'PASSWORD'")
            .execute(&self.pool)
            .await;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                remote_id TEXT NOT NULL,
                name TEXT NOT NULL,
                unread_count INTEGER DEFAULT 0,
                system_role TEXT,
                UNIQUE(account_id, remote_id),
                FOREIGN KEY(account_id) REFERENCES accounts(id)
            )",
        )
        .execute(&self.pool)
        .await?;

        // 兼容性：如果旧表没有 system_role 列
        let _ = sqlx::query("ALTER TABLE folders ADD COLUMN system_role TEXT")
            .execute(&self.pool)
            .await;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS emails (
                id TEXT PRIMARY KEY,
                folder_id TEXT NOT NULL,
                remote_id TEXT NOT NULL,
                subject TEXT,
                sender TEXT,
                date TEXT,
                snippet TEXT,
                flags TEXT DEFAULT '[]',
                body_text TEXT,
                body_html TEXT,
                headers TEXT,
                detail_cached_at INTEGER,
                message_id TEXT,
                UNIQUE(folder_id, remote_id),
                FOREIGN KEY(folder_id) REFERENCES folders(id)
            )",
        )
        .execute(&self.pool)
        .await?;

        // 兼容性：如果旧表没有 flags 列
        let _ = sqlx::query("ALTER TABLE emails ADD COLUMN flags TEXT DEFAULT '[]'")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("ALTER TABLE emails ADD COLUMN headers TEXT")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("ALTER TABLE emails ADD COLUMN detail_cached_at INTEGER")
            .execute(&self.pool)
            .await;

        sqlx::query(
            "CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
                id UNINDEXED,
                folder_id UNINDEXED,
                subject,
                sender,
                snippet,
                body_text,
                tokenize='unicode61'
            )",
        )
        .execute(&self.pool)
        .await?;
        let _ = sqlx::query("ALTER TABLE emails_fts ADD COLUMN folder_id")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("ALTER TABLE emails_fts ADD COLUMN body_text")
            .execute(&self.pool)
            .await;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS attachments (
                id TEXT PRIMARY KEY,
                email_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                content_id TEXT,
                is_inline BOOLEAN NOT NULL DEFAULT 0,
                FOREIGN KEY(email_id) REFERENCES emails(id)
            )",
        )
        .execute(&self.pool)
        .await?;

        // 兼容性：如果旧表没有 content_id/is_inline 列
        let _ = sqlx::query("ALTER TABLE attachments ADD COLUMN content_id TEXT")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("ALTER TABLE attachments ADD COLUMN is_inline BOOLEAN NOT NULL DEFAULT 0")
            .execute(&self.pool)
            .await;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
        )
        .execute(&self.pool)
        .await?;
        self.ensure_default_settings().await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS search_history (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                query TEXT NOT NULL,
                last_used_at INTEGER NOT NULL,
                UNIQUE(account_id, query),
                FOREIGN KEY(account_id) REFERENCES accounts(id)
            )",
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn ensure_default_settings(&self) -> Result<()> {
        for (key, value) in DEFAULT_SETTINGS {
            sqlx::query(
                "INSERT INTO settings (key, value)
                 VALUES (?, ?)
                 ON CONFLICT(key) DO NOTHING",
            )
            .bind(key)
            .bind(value)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    pub async fn upsert_account(
        &self,
        email: &str,
        display_name: Option<&str>,
        imap_host: &str,
        imap_port: u16,
        imap_use_tls: bool,
        smtp_host: &str,
        smtp_port: u16,
        smtp_use_tls: bool,
    ) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let imap_security = Self::derive_security_mode(imap_port, imap_use_tls);
        let smtp_security = Self::derive_security_mode(smtp_port, smtp_use_tls);
        let returning_id: String = sqlx::query(
            "INSERT INTO accounts (id, email, display_name, imap_host, imap_port, imap_use_tls, imap_security, smtp_host, smtp_port, smtp_use_tls, smtp_security, auth_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSWORD')
             ON CONFLICT(email) DO UPDATE SET
                display_name = excluded.display_name,
                imap_host = excluded.imap_host,
                imap_port = excluded.imap_port,
                imap_use_tls = excluded.imap_use_tls,
                imap_security = excluded.imap_security,
                smtp_host = excluded.smtp_host,
                smtp_port = excluded.smtp_port,
                smtp_use_tls = excluded.smtp_use_tls,
                smtp_security = excluded.smtp_security
             RETURNING id"
        )
        .bind(&id)
        .bind(email)
        .bind(display_name)
        .bind(imap_host)
        .bind(imap_port as i64)
        .bind(imap_use_tls)
        .bind(imap_security)
        .bind(smtp_host)
        .bind(smtp_port as i64)
        .bind(smtp_use_tls)
        .bind(smtp_security)
        .fetch_one(&self.pool)
        .await
        .map(|row| row.get::<String, _>(0))
        .context("Failed to upsert account")?;

        self.ensure_default_folders(&returning_id).await?;
        
        Ok(returning_id)
    }

    async fn ensure_default_folders(&self, account_id: &str) -> Result<()> {
        let defaults = [
            ("INBOX", "Inbox", "INBOX"),
            ("SENT", "Sent", "SENT"),
            ("DRAFTS", "Drafts", "DRAFTS"),
            ("SPAM", "Spam", "SPAM"),
            ("TRASH", "Trash", "TRASH"),
            ("ARCHIVE", "Archive", "ARCHIVE"),
        ];

        for (remote_id, name, role) in defaults.iter() {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT OR IGNORE INTO folders (id, account_id, remote_id, name, unread_count, system_role) 
                 VALUES (?, ?, ?, ?, 0, ?)",
            )
            .bind(&id)
            .bind(account_id)
            .bind(remote_id)
            .bind(name)
            .bind(role)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    pub async fn upsert_folder(
        &self,
        account_id: &str,
        remote_id: &str,
        name: &str,
        unread_count: u32,
        system_role: Option<&str>,
    ) -> Result<String> {
        let existing = sqlx::query("SELECT id FROM folders WHERE account_id = ? AND remote_id = ?")
            .bind(account_id)
            .bind(remote_id)
            .fetch_optional(&self.pool)
            .await?;

        if let Some(row) = existing {
            let id: String = row.get(0);
            sqlx::query("UPDATE folders SET name = ?, unread_count = ?, system_role = ? WHERE id = ?")
                .bind(name)
                .bind(unread_count as i64)
                .bind(system_role)
                .bind(&id)
                .execute(&self.pool)
                .await?;
            Ok(id)
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO folders (id, account_id, remote_id, name, unread_count, system_role) 
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(account_id)
            .bind(remote_id)
            .bind(name)
            .bind(unread_count as i64)
            .bind(system_role)
            .execute(&self.pool)
            .await?;
            Ok(id)
        }
    }

    pub async fn delete_folder(&self, folder_id: &str) -> Result<()> {
        // Cascade delete emails (which might cascade to attachments naturally or we need to delete them)
        // Wait, SQLite PRAGMA foreign_keys is likely enabled, but to be safe we explicitly delete.
        sqlx::query("DELETE FROM emails WHERE folder_id = ?")
            .bind(folder_id)
            .execute(&self.pool)
            .await?;

        sqlx::query("DELETE FROM folders WHERE id = ?")
            .bind(folder_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn find_email_by_message_id(&self, folder_id: &str, message_id: &str) -> Result<Option<String>> {
        let res: Option<(String,)> = sqlx::query_as(
            "SELECT remote_id FROM emails WHERE folder_id = ? AND message_id = ?"
        )
        .bind(folder_id)
        .bind(message_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(res.map(|r| r.0))
    }

    pub async fn update_remote_id(&self, folder_id: &str, old_remote_id: &str, new_remote_id: &str) -> Result<()> {
        sqlx::query("UPDATE emails SET remote_id = ? WHERE folder_id = ? AND remote_id = ?")
            .bind(new_remote_id)
            .bind(folder_id)
            .bind(old_remote_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn upsert_email(
        &self,
        folder_id: &str,
        summary: &super::traits::EmailSummary,
    ) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let mut tx = self.pool.begin().await?;

        let flags_json = serde_json::to_string(&summary.flags).unwrap_or_else(|_| "[]".to_string());
        let email_id: String = sqlx::query(
            "INSERT INTO emails (id, folder_id, remote_id, subject, sender, date, snippet, flags, message_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(folder_id, remote_id) DO UPDATE SET
                subject = excluded.subject,
                sender = excluded.sender,
                date = excluded.date,
                snippet = excluded.snippet,
                flags = excluded.flags,
                message_id = excluded.message_id
             RETURNING id",
        )
        .bind(&id)
        .bind(folder_id)
        .bind(&summary.uid)
        .bind(&summary.subject)
        .bind(&summary.from)
        .bind(&summary.date)
        .bind(&summary.snippet)
        .bind(flags_json)
        .bind(&summary.message_id)
        .fetch_one(&mut *tx)
        .await
        .map(|row| row.get::<String, _>(0))?;

        sqlx::query("DELETE FROM emails_fts WHERE id = ?")
            .bind(&email_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO emails_fts (id, folder_id, subject, sender, snippet, body_text) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(&email_id)
            .bind(folder_id)
            .bind(&summary.subject)
            .bind(&summary.from)
            .bind(&summary.snippet)
            .bind(&summary.snippet)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(email_id)
    }

    pub async fn search_emails(&self, query: &str) -> Result<Vec<String>> {
        let fts_query = query
            .split_whitespace()
            .map(|word| {
                let safe_word = word.replace('\'', "''").replace('"', "");
                format!("\"{}\"*", safe_word)
            })
            .collect::<Vec<_>>()
            .join(" AND ");

        let fts_query = if fts_query.is_empty() {
            String::from("*")
        } else {
            fts_query
        };

        let rows: Vec<(String,)> =
            sqlx::query_as("SELECT id FROM emails_fts WHERE emails_fts MATCH ? ORDER BY rank")
                .bind(fts_query)
                .fetch_all(&self.pool)
                .await?;

        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    pub async fn search_emails_filtered(
        &self,
        account_id: &str,
        query: &str,
        sender: Option<&str>,
        start_date: Option<&str>,
        end_date: Option<&str>,
        has_attachments: Option<bool>,
        folder_ids: Option<&[String]>,
    ) -> Result<Vec<String>> {
        let fts_query = query
            .split_whitespace()
            .map(|word| {
                let safe_word = word.replace('\'', "''").replace('"', "");
                format!("\"{}\"*", safe_word)
            })
            .collect::<Vec<_>>()
            .join(" AND ");

        let fts_query = if fts_query.is_empty() {
            String::from("*")
        } else {
            fts_query
        };

        let mut sql = String::from(
            "SELECT emails_fts.id FROM emails_fts \
             JOIN emails ON emails.id = emails_fts.id \
             JOIN folders ON folders.id = emails.folder_id \
             WHERE emails_fts MATCH ? AND folders.account_id = ?",
        );

        if sender.is_some() {
            sql.push_str(" AND emails.sender LIKE ?");
        }
        if start_date.is_some() {
            sql.push_str(" AND emails.date >= ?");
        }
        if end_date.is_some() {
            sql.push_str(" AND emails.date <= ?");
        }
        if let Some(has_attachments) = has_attachments {
            if has_attachments {
                sql.push_str(" AND EXISTS(SELECT 1 FROM attachments WHERE attachments.email_id = emails.id)");
            } else {
                sql.push_str(" AND NOT EXISTS(SELECT 1 FROM attachments WHERE attachments.email_id = emails.id)");
            }
        }
        if let Some(folder_ids) = folder_ids {
            if !folder_ids.is_empty() {
                let placeholders = vec!["?"; folder_ids.len()].join(", ");
                sql.push_str(" AND emails.folder_id IN (");
                sql.push_str(&placeholders);
                sql.push(')');
            }
        }

        sql.push_str(" ORDER BY rank");

        let sender_like = sender.map(|value| format!("%{}%", value));
        let mut query = sqlx::query_as::<_, (String,)>(&sql)
            .bind(fts_query)
            .bind(account_id);

        if let Some(sender_like) = sender_like {
            query = query.bind(sender_like);
        }
        if let Some(start_date) = start_date {
            query = query.bind(start_date);
        }
        if let Some(end_date) = end_date {
            query = query.bind(end_date);
        }
        if let Some(folder_ids) = folder_ids {
            if !folder_ids.is_empty() {
                for folder_id in folder_ids {
                    query = query.bind(folder_id);
                }
            }
        }

        let rows: Vec<(String,)> = query.fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    pub async fn get_last_uid(&self, folder_id: &str) -> Result<u32> {
        let res: Option<(i64,)> = sqlx::query_as(
            "SELECT MAX(CAST(remote_id AS INTEGER))
             FROM emails
             WHERE folder_id = ?
             AND remote_id != ''
             AND remote_id NOT GLOB '*[^0-9]*'",
        )
        .bind(folder_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(res.map(|(uid,)| uid as u32).unwrap_or(0))
    }

    pub async fn get_first_uid(&self, folder_id: &str) -> Result<u32> {
        let res: Option<(i64,)> = sqlx::query_as(
            "SELECT MIN(CAST(remote_id AS INTEGER))
             FROM emails
             WHERE folder_id = ?
             AND remote_id != ''
             AND remote_id NOT GLOB '*[^0-9]*'",
        )
        .bind(folder_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(res.map(|(uid,)| uid as u32).unwrap_or(0))
    }

    pub async fn get_account_by_email(&self, email: &str) -> Result<Option<AccountInfo>> {
        let row: Option<(String, String, Option<String>, String, i64, bool, String, i64, bool)> = sqlx::query_as(
            "SELECT id, email, display_name, imap_host, imap_port, imap_use_tls, smtp_host, smtp_port, smtp_use_tls FROM accounts WHERE email = ?"
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| AccountInfo {
            id: r.0,
            email: r.1,
            display_name: r.2,
            imap_host: r.3,
            imap_port: r.4,
            imap_use_tls: r.5,
            smtp_host: r.6,
            smtp_port: r.7,
            smtp_use_tls: r.8,
        }))
    }

    pub async fn find_account_by_domain(&self, domain: &str) -> Result<Option<AccountInfo>> {
        let pattern = format!("%@{}", domain);
        let row: Option<(String, String, Option<String>, String, i64, bool, String, i64, bool)> =
            sqlx::query_as(
                "SELECT id, email, display_name, imap_host, imap_port, imap_use_tls, smtp_host, smtp_port, smtp_use_tls
                 FROM accounts WHERE email LIKE ? ORDER BY email LIMIT 1",
            )
            .bind(pattern)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(|r| AccountInfo {
            id: r.0,
            email: r.1,
            display_name: r.2,
            imap_host: r.3,
            imap_port: r.4,
            imap_use_tls: r.5,
            smtp_host: r.6,
            smtp_port: r.7,
            smtp_use_tls: r.8,
        }))
    }

    pub async fn get_folders_for_account(&self, account_id: &str) -> Result<Vec<FolderInfo>> {
        let rows = sqlx::query(
            "SELECT id, name, remote_id, unread_count, system_role
             FROM folders
             WHERE account_id = ?
             ORDER BY CASE UPPER(system_role)
                 WHEN 'INBOX' THEN 0
                 WHEN 'SENT' THEN 1
                 WHEN 'DRAFTS' THEN 2
                 WHEN 'SPAM' THEN 3
                 WHEN 'TRASH' THEN 4
                 WHEN 'ARCHIVE' THEN 5
                 ELSE 6
             END,
             LOWER(name)"
        )
            .bind(account_id)
            .fetch_all(&self.pool)
            .await?;

        let mut folders = Vec::new();
        for row in rows {
            folders.push(FolderInfo {
                id: row.get(0),
                name: row.get(1),
                remote_id: row.get(2),
                unread_count: row.get::<i64, _>(3) as u32,
                system_role: row.get(4),
            });
        }
        Ok(folders)
    }

    pub async fn update_folder_unread_count(&self, folder_id: &str) -> Result<()> {
        // 计算未读邮件数：flags JSON 字符串中不包含 \Seen 标记
        let unread: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM emails WHERE folder_id = ? AND instr(flags, '\\Seen') = 0"
        )
        .bind(folder_id)
        .fetch_one(&self.pool)
        .await?;

        sqlx::query("UPDATE folders SET unread_count = ? WHERE id = ?")
            .bind(unread.0)
            .bind(folder_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn get_all_uids_in_folder(&self, folder_id: &str) -> Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as("SELECT remote_id FROM emails WHERE folder_id = ?")
            .bind(folder_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    pub async fn delete_email_by_uid(&self, folder_id: &str, uid: &str) -> Result<()> {
        let mut tx = self.pool.begin().await?;

        // 查找内部 ID 以便清理 FTS
        let email_id: Option<(String,)> = sqlx::query_as("SELECT id FROM emails WHERE folder_id = ? AND remote_id = ?")
            .bind(folder_id)
            .bind(uid)
            .fetch_optional(&mut *tx)
            .await?;

        if let Some((id,)) = email_id {
            sqlx::query("DELETE FROM emails_fts WHERE id = ?").bind(&id).execute(&mut *tx).await?;
            sqlx::query("DELETE FROM attachments WHERE email_id = ?").bind(&id).execute(&mut *tx).await?;
            sqlx::query("DELETE FROM emails WHERE id = ?").bind(&id).execute(&mut *tx).await?;
        }

        tx.commit().await?;
        Ok(())
    }



    pub async fn delete_all_folders_for_account(&self, account_id: &str) -> Result<()> {
        // First delete all emails in those folders
        sqlx::query("DELETE FROM emails WHERE folder_id IN (SELECT id FROM folders WHERE account_id = ?)")
            .bind(account_id)
            .execute(&self.pool)
            .await?;
        // Then delete the folders
        sqlx::query("DELETE FROM folders WHERE account_id = ?")
            .bind(account_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn has_any_system_roles(&self, account_id: &str) -> Result<bool> {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM folders WHERE account_id = ? AND system_role IS NOT NULL")
            .bind(account_id)
            .fetch_one(&self.pool)
            .await?;
        Ok(count.0 > 0)
    }

    pub async fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let res: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE key = ?")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;
        Ok(res.map(|(v,)| v))
    }

    pub async fn get_theme_mode(&self) -> Result<ThemeMode> {
        let value = self
            .get_setting(SETTING_THEME_MODE)
            .await?
            .unwrap_or_else(|| "system".to_string());
        Ok(ThemeMode::parse(&value).unwrap_or(ThemeMode::System))
    }

    pub async fn set_theme_mode(&self, mode: &str) -> Result<()> {
        let parsed = match ThemeMode::parse(mode) {
            Some(value) => value,
            None => bail!("Invalid theme mode: {}", mode),
        };
        self.set_setting(SETTING_THEME_MODE, parsed.as_str()).await
    }

    pub async fn get_shortcuts(&self) -> Result<String> {
        Ok(self
            .get_setting(SETTING_SHORTCUTS)
            .await?
            .unwrap_or_else(|| "{}".to_string()))
    }

    pub async fn set_shortcuts(&self, shortcuts: &str) -> Result<()> {
        let value: serde_json::Value = serde_json::from_str(shortcuts)
            .context("Invalid shortcuts JSON")?;
        if !value.is_object() {
            bail!("Shortcut config must be a JSON object");
        }
        let normalized =
            serde_json::to_string(&value).context("Failed to serialize shortcuts")?;
        self.set_setting(SETTING_SHORTCUTS, &normalized).await
    }

    pub async fn record_search_history(&self, account_id: &str, query: &str) -> Result<()> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(());
        }
        let now = chrono::Utc::now().timestamp_millis();
        let max_row: (Option<i64>,) = sqlx::query_as(
            "SELECT MAX(last_used_at) FROM search_history WHERE account_id = ?",
        )
        .bind(account_id)
        .fetch_one(&self.pool)
        .await?;
        let last_used_at = match max_row.0 {
            Some(max_value) if max_value >= now => max_value + 1,
            _ => now,
        };
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO search_history (id, account_id, query, last_used_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(account_id, query)
             DO UPDATE SET last_used_at = excluded.last_used_at",
        )
        .bind(id)
        .bind(account_id)
        .bind(trimmed)
        .bind(last_used_at)
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "DELETE FROM search_history
             WHERE account_id = ?
             AND id NOT IN (
                 SELECT id FROM search_history
                 WHERE account_id = ?
                 ORDER BY last_used_at DESC
                 LIMIT 10
             )",
        )
        .bind(account_id)
        .bind(account_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_search_history(&self, account_id: &str) -> Result<Vec<(String, i64)>> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT query, last_used_at
             FROM search_history
             WHERE account_id = ?
             ORDER BY last_used_at DESC
             LIMIT 10",
        )
        .bind(account_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn clear_search_history(&self, account_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM search_history WHERE account_id = ?")
            .bind(account_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_accounts_detailed(&self) -> Result<Vec<AccountInfo>> {
        let rows: Vec<(String, String, Option<String>, String, i64, bool, String, i64, bool)> = sqlx::query_as(
            "SELECT id, email, display_name, imap_host, imap_port, imap_use_tls, smtp_host, smtp_port, smtp_use_tls FROM accounts"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| AccountInfo {
            id: r.0,
            email: r.1,
            display_name: r.2,
            imap_host: r.3,
            imap_port: r.4,
            imap_use_tls: r.5,
            smtp_host: r.6,
            smtp_port: r.7,
            smtp_use_tls: r.8,
        }).collect())
    }

    pub async fn get_all_settings(&self) -> Result<std::collections::HashMap<String, String>> {
        let rows: Vec<(String, String)> = sqlx::query_as("SELECT key, value FROM settings")
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().collect())
    }

    pub async fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        sqlx::query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .bind(key)
            .bind(value)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
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

        let columns = sqlx::query("PRAGMA table_info(accounts)")
            .fetch_all(&db.pool)
            .await
            .unwrap();
        let column_names: Vec<String> = columns
            .into_iter()
            .map(|row| row.get::<String, _>(1))
            .collect();
        assert!(column_names.contains(&"imap_security".to_string()));
        assert!(column_names.contains(&"smtp_security".to_string()));
        assert!(column_names.contains(&"auth_type".to_string()));
    }

    #[tokio::test]
    async fn test_settings_defaults_seeded() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let auto_download = db
            .get_setting(SETTING_AUTO_DOWNLOAD_ATTACHMENTS)
            .await
            .unwrap();
        let background_sync = db
            .get_setting(SETTING_BACKGROUND_SYNC_HISTORY)
            .await
            .unwrap();
        let theme = db.get_setting(SETTING_THEME_MODE).await.unwrap();
        let shortcuts = db.get_setting(SETTING_SHORTCUTS).await.unwrap();

        assert_eq!(auto_download.as_deref(), Some("false"));
        assert_eq!(background_sync.as_deref(), Some("true"));
        assert_eq!(theme.as_deref(), Some("system"));
        assert_eq!(shortcuts.as_deref(), Some("{}"));
    }

    #[tokio::test]
    async fn test_settings_theme_roundtrip() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        db.set_theme_mode("dark").await.unwrap();
        assert_eq!(db.get_theme_mode().await.unwrap(), ThemeMode::Dark);
        assert!(db.set_theme_mode("neon").await.is_err());
    }

    #[tokio::test]
    async fn test_settings_shortcuts_validation() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        db.set_shortcuts(r#"{"compose":"cmd+n"}"#).await.unwrap();
        let stored = db.get_shortcuts().await.unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&stored).unwrap();
        assert!(parsed.is_object());
        assert!(db.set_shortcuts(r#"["bad"]"#).await.is_err());
        assert!(db.set_shortcuts(r#"{invalid}"#).await.is_err());
    }

    #[tokio::test]
    async fn test_upsert_logic() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db
            .upsert_account("test@test.com", None, "host", 993, true, "host", 465, true)
            .await
            .unwrap();
        assert!(!acct_id.is_empty());

        let folder_id = db
            .upsert_folder(&acct_id, "INBOX", "Inbox", 10, None)
            .await
            .unwrap();
        assert!(!folder_id.is_empty());

        // 测试更新
        let folder_id_2 = db
            .upsert_folder(&acct_id, "INBOX", "Updated Inbox", 12, None)
            .await
            .unwrap();
        assert_eq!(folder_id, folder_id_2);
    }

    #[tokio::test]
    async fn test_fts_search() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db
            .upsert_account("search@test.com", None, "host", 993, true, "host", 465, true)
            .await
            .unwrap();
        let folder_id = db
            .upsert_folder(&acct_id, "INBOX", "Inbox", 0, None)
            .await
            .unwrap();

        let email = crate::core::traits::EmailSummary {
            uid: "100".into(),
            subject: "Rust Programming Language".into(),
            from: "rust@rust-lang.org".into(),
            date: "2026-01-01".into(),
            snippet: "This is a book about Rust.".into(),
            flags: vec!["\\Seen".to_string()],
            message_id: None,
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

        let acct1 = db
            .upsert_account("user1@test.com", None, "host", 993, true, "host", 465, true)
            .await
            .unwrap();
        let acct2 = db
            .upsert_account("user2@test.com", None, "host", 993, true, "host", 465, true)
            .await
            .unwrap();

        let folder1 = db.upsert_folder(&acct1, "INBOX", "Inbox", 0, None).await.unwrap();
        let folder2 = db.upsert_folder(&acct2, "INBOX", "Inbox", 0, None).await.unwrap();

        assert_ne!(folder1, folder2);

        let email1 = crate::core::traits::EmailSummary {
            uid: "1".into(),
            subject: "Msg 1".into(),
            from: "a@a.com".into(),
            date: "now".into(),
            snippet: "s1".into(),
            flags: vec![],
            message_id: None,
        };
        db.upsert_email(&folder1, &email1).await.unwrap();

        let email2 = crate::core::traits::EmailSummary {
            uid: "1".into(), // Same UID but in different folder/account
            subject: "Msg 2".into(),
            from: "b@b.com".into(),
            date: "now".into(),
            snippet: "s2".into(),
            flags: vec![],
            message_id: None,
        };
        db.upsert_email(&folder2, &email2).await.unwrap();

        // 验证同步引擎获取到的 UID 是隔离s的
        assert_eq!(db.get_last_uid(&folder1).await.unwrap(), 1);
        assert_eq!(db.get_last_uid(&folder2).await.unwrap(), 1);

        // 验证全文搜索结果包含两条记录
        let search_results = db.search_emails("Msg").await.unwrap();
        assert_eq!(search_results.len(), 2);
    }

    #[tokio::test]
    async fn test_unread_count_calculation() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db.upsert_account("count@test.com", None, "h", 993, true, "h", 465, true).await.unwrap();
        let folder_id = db.upsert_folder(&acct_id, "INBOX", "Inbox", 0, None).await.unwrap();

        // 1. 插入一封未读邮件
        let email1 = crate::core::traits::EmailSummary {
            uid: "1".into(),
            subject: "Unread".into(),
            from: "u@u.com".into(),
            date: "now".into(),
            snippet: "s1".into(),
            flags: vec!["\\Draft".to_string()], // 没有 \Seen
            message_id: None,
        };
        db.upsert_email(&folder_id, &email1).await.unwrap();
        db.update_folder_unread_count(&folder_id).await.unwrap();
        
        let folders = db.get_folders_for_account(&acct_id).await.unwrap();
        let inbox = folders.iter().find(|folder| folder.id == folder_id).unwrap();
        assert_eq!(inbox.unread_count, 1);

        // 2. 插入一封已读邮件
        let email2 = crate::core::traits::EmailSummary {
            uid: "2".into(),
            subject: "Read".into(),
            from: "r@r.com".into(),
            date: "now".into(),
            snippet: "s2".into(),
            flags: vec!["\\Seen".to_string()],
            message_id: None,
        };
        db.upsert_email(&folder_id, &email2).await.unwrap();
        db.update_folder_unread_count(&folder_id).await.unwrap();

        let folders = db.get_folders_for_account(&acct_id).await.unwrap();
        let inbox = folders.iter().find(|folder| folder.id == folder_id).unwrap();
        assert_eq!(inbox.unread_count, 1); // 依然是 1

        // 3. 更新第一封邮件为已读
        let email1_read = crate::core::traits::EmailSummary {
            uid: "1".into(),
            subject: "Unread".into(),
            from: "u@u.com".into(),
            date: "now".into(),
            snippet: "s1".into(),
            flags: vec!["\\Seen".to_string(), "\\Answered".to_string()],
            message_id: None,
        };
        db.upsert_email(&folder_id, &email1_read).await.unwrap();
        db.update_folder_unread_count(&folder_id).await.unwrap();

        let folders = db.get_folders_for_account(&acct_id).await.unwrap();
        let inbox = folders.iter().find(|folder| folder.id == folder_id).unwrap();
        assert_eq!(inbox.unread_count, 0);
    }

    #[tokio::test]
    async fn test_folder_ordering_prioritizes_system_roles() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db.upsert_account("order@test.com", None, "h", 993, true, "h", 465, true).await.unwrap();
        db.upsert_folder(&acct_id, "CUSTOM", "Custom", 0, None).await.unwrap();
        db.upsert_folder(&acct_id, "SPAM", "Spam", 0, Some("SPAM")).await.unwrap();
        db.upsert_folder(&acct_id, "INBOX", "Inbox", 0, Some("INBOX")).await.unwrap();
        db.upsert_folder(&acct_id, "ARCHIVE", "Archive", 0, Some("ARCHIVE")).await.unwrap();
        db.upsert_folder(&acct_id, "SENT", "Sent", 0, Some("SENT")).await.unwrap();

        let folders = db.get_folders_for_account(&acct_id).await.unwrap();
        let ordered: Vec<String> = folders.into_iter().map(|f| f.remote_id).collect();
        assert_eq!(ordered, vec!["INBOX", "SENT", "DRAFTS", "SPAM", "TRASH", "ARCHIVE", "CUSTOM"]);
    }

    #[tokio::test]
    async fn test_delete_email_by_uid_cleans_attachments() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db.upsert_account("delete@test.com", None, "h", 993, true, "h", 465, true).await.unwrap();
        let folder_id = db.upsert_folder(&acct_id, "INBOX", "Inbox", 0, Some("INBOX")).await.unwrap();

        let email = crate::core::traits::EmailSummary {
            uid: "101".into(),
            subject: "Cleanup".into(),
            from: "a@b.com".into(),
            date: "now".into(),
            snippet: "s".into(),
            flags: vec![],
            message_id: None,
        };
        let email_id = db.upsert_email(&folder_id, &email).await.unwrap();
        sqlx::query("INSERT INTO attachments (id, email_id, filename, mime_type, size) VALUES (?, ?, ?, ?, ?)")
            .bind("att-1")
            .bind(&email_id)
            .bind("file.txt")
            .bind("text/plain")
            .bind(1_i64)
            .execute(&db.pool)
            .await
            .unwrap();

        db.delete_email_by_uid(&folder_id, "101").await.unwrap();

        let attachment_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM attachments WHERE email_id = ?")
            .bind(&email_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
        let email_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM emails WHERE id = ?")
            .bind(&email_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
        let fts_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM emails_fts WHERE id = ?")
            .bind(&email_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();

        assert_eq!(attachment_count.0, 0);
        assert_eq!(email_count.0, 0);
        assert_eq!(fts_count.0, 0);
    }

    #[tokio::test]
    async fn test_email_list_has_attachments_flag() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db.upsert_account("list@test.com", None, "h", 993, true, "h", 465, true).await.unwrap();
        let folder_id = db.upsert_folder(&acct_id, "INBOX", "Inbox", 0, Some("INBOX")).await.unwrap();

        let summary = crate::core::traits::EmailSummary {
            uid: "55".into(),
            subject: "Attachment mail".into(),
            from: "sender@test.com".into(),
            date: "now".into(),
            snippet: "has attachment".into(),
            flags: vec![],
            message_id: None,
        };
        let email_id = db.upsert_email(&folder_id, &summary).await.unwrap();

        sqlx::query(
            "INSERT INTO attachments (id, email_id, filename, mime_type, size, content_id, is_inline)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(format!("{}::1.2", email_id))
        .bind(&email_id)
        .bind("file.txt")
        .bind("text/plain")
        .bind(10_i64)
        .bind(Option::<String>::None)
        .bind(false)
        .execute(&db.pool)
        .await
        .unwrap();

        let rows: Vec<(i64,)> = sqlx::query_as(
            "SELECT EXISTS(SELECT 1 FROM attachments WHERE attachments.email_id = emails.id)
             FROM emails
             WHERE folder_id = ?",
        )
        .bind(&folder_id)
        .fetch_all(&db.pool)
        .await
        .unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].0, 1);
    }

    #[tokio::test]
    async fn test_detail_cache_columns_roundtrip() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db.upsert_account("cache@test.com", None, "h", 993, true, "h", 465, true).await.unwrap();
        let folder_id = db.upsert_folder(&acct_id, "INBOX", "Inbox", 0, Some("INBOX")).await.unwrap();

        let summary = crate::core::traits::EmailSummary {
            uid: "77".into(),
            subject: "Cached detail".into(),
            from: "cache@test.com".into(),
            date: "now".into(),
            snippet: "cache".into(),
            flags: vec![],
            message_id: None,
        };
        let email_id = db.upsert_email(&folder_id, &summary).await.unwrap();

        let headers = vec![crate::core::traits::EmailHeader {
            name: "From".to_string(),
            value: "cache@test.com".to_string(),
        }];
        let headers_json = serde_json::to_string(&headers).unwrap();
        let cached_at = chrono::Utc::now().timestamp();

        sqlx::query(
            "UPDATE emails SET body_html = ?, body_text = ?, headers = ?, detail_cached_at = ? WHERE id = ?",
        )
        .bind("<p>cached</p>")
        .bind("cached text")
        .bind(&headers_json)
        .bind(cached_at)
        .bind(&email_id)
        .execute(&db.pool)
        .await
        .unwrap();

        let row: (Option<String>, Option<String>, Option<String>, Option<i64>) = sqlx::query_as(
            "SELECT body_html, body_text, headers, detail_cached_at FROM emails WHERE id = ?",
        )
        .bind(&email_id)
        .fetch_one(&db.pool)
        .await
        .unwrap();

        assert_eq!(row.0.as_deref(), Some("<p>cached</p>"));
        assert_eq!(row.1.as_deref(), Some("cached text"));
        assert!(row.3.is_some());

        let parsed: Vec<crate::core::traits::EmailHeader> =
            serde_json::from_str(row.2.as_ref().unwrap()).unwrap();
        assert_eq!(parsed[0].name, "From");
        assert_eq!(parsed[0].value, "cache@test.com");
    }

    #[tokio::test]
    async fn test_search_filters_by_sender_and_attachments() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db
            .upsert_account("filter@test.com", None, "host", 993, true, "host", 465, true)
            .await
            .unwrap();
        let folder_id = db
            .upsert_folder(&acct_id, "INBOX", "Inbox", 0, None)
            .await
            .unwrap();

        let email_with_attachment = crate::core::traits::EmailSummary {
            uid: "201".into(),
            subject: "Report".into(),
            from: "alice@test.com".into(),
            date: "2026-02-01".into(),
            snippet: "Project report".into(),
            flags: vec![],
            message_id: None,
        };
        let email_id = db.upsert_email(&folder_id, &email_with_attachment).await.unwrap();

        sqlx::query(
            "INSERT INTO attachments (id, email_id, filename, mime_type, size, content_id, is_inline)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(format!("{}::1", email_id))
        .bind(&email_id)
        .bind("report.pdf")
        .bind("application/pdf")
        .bind(10_i64)
        .bind(Option::<String>::None)
        .bind(false)
        .execute(&db.pool)
        .await
        .unwrap();

        let email_no_attachment = crate::core::traits::EmailSummary {
            uid: "202".into(),
            subject: "Hello".into(),
            from: "bob@test.com".into(),
            date: "2026-02-02".into(),
            snippet: "Greetings".into(),
            flags: vec![],
            message_id: None,
        };
        db.upsert_email(&folder_id, &email_no_attachment).await.unwrap();

        let results = db
            .search_emails_filtered(
                &acct_id,
                "Report",
                Some("alice"),
                None,
                None,
                Some(true),
                Some(&[folder_id.clone()]),
            )
            .await
            .unwrap();
        assert_eq!(results, vec![email_id]);
    }

    #[tokio::test]
    async fn test_search_history_limit_and_clear() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        let db = Database { pool };
        db.init_tables().await.unwrap();

        let acct_id = db
            .upsert_account("history@test.com", None, "host", 993, true, "host", 465, true)
            .await
            .unwrap();

        for i in 0..12 {
            db.record_search_history(&acct_id, &format!("query-{}", i))
                .await
                .unwrap();
        }

        let history = db.get_search_history(&acct_id).await.unwrap();
        assert_eq!(history.len(), 10);
        assert_eq!(history[0].0, "query-11");

        db.clear_search_history(&acct_id).await.unwrap();
        let history = db.get_search_history(&acct_id).await.unwrap();
        assert!(history.is_empty());
    }
}
