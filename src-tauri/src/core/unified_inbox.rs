use super::database::{Database, UnifiedInboxRow};
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnifiedInboxItem {
    pub id: String,
    pub uid: String,
    pub account_id: String,
    pub account_email: String,
    pub folder_id: String,
    pub folder_name: String,
    pub subject: String,
    pub from: String,
    pub date: String,
    pub snippet: String,
    pub flags: Vec<String>,
}

pub type GlobalSearchItem = UnifiedInboxItem;

pub async fn get_unified_inbox(
    db: &Database,
    account_ids: Option<&[String]>,
    folder_ids: Option<&[String]>,
) -> Result<Vec<UnifiedInboxItem>> {
    let rows = db.get_unified_inbox_rows(account_ids, folder_ids, 100).await?;
    Ok(rows.into_iter().map(map_row).collect())
}

pub async fn search_emails_global(
    db: &Database,
    query: &str,
    account_ids: Option<&[String]>,
    folder_ids: Option<&[String]>,
) -> Result<Vec<GlobalSearchItem>> {
    let rows = db
        .search_emails_global_with_context(query, account_ids, folder_ids)
        .await?;
    Ok(rows.into_iter().map(map_row).collect())
}

fn map_row(row: UnifiedInboxRow) -> UnifiedInboxItem {
    let flags: Vec<String> = serde_json::from_str(&row.flags_json).unwrap_or_default();
    UnifiedInboxItem {
        id: row.id,
        uid: row.uid,
        account_id: row.account_id,
        account_email: row.account_email,
        folder_id: row.folder_id,
        folder_name: row.folder_name,
        subject: row.subject,
        from: row.from,
        date: row.date,
        snippet: row.snippet,
        flags,
    }
}
