use crate::core::database::Database;
use crate::core::traits::{self, AccountInfo, AttachmentInfo, EmailHeader, EmailSummary, FolderInfo, MailClient, MailSender, SendEmailRequest};
use crate::core::imap_client::RealImapClient;
use crate::core::smtp_client::RealSmtpClient;
use crate::core::sync_engine::SyncEngine;
use crate::core::security::SecurityService;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::State;

fn validate_account_update(email: &str, imap_host: &str, smtp_host: &str) -> Result<(), String> {
    if email.trim().is_empty() || imap_host.trim().is_empty() || smtp_host.trim().is_empty() {
        return Err("Email, IMAP host, and SMTP host are required".to_string());
    }
    Ok(())
}

fn resolve_account_test_password(email: &str, password: Option<String>) -> Result<String, String> {
    match password {
        Some(password) if !password.trim().is_empty() => Ok(password),
        _ => SecurityService::get_password(email)
            .map_err(|_| "Missing password for account connection test".to_string()),
    }
}

#[derive(Serialize)]
pub struct AccountDiscoveryResult {
    email: String,
    source: String,
    requires_confirmation: bool,
    imap_host: String,
    imap_port: u16,
    imap_use_tls: bool,
    smtp_host: String,
    smtp_port: u16,
    smtp_use_tls: bool,
}

#[derive(Serialize)]
pub struct EmailListItem {
    pub uid: String,
    pub subject: String,
    pub from: String,
    pub date: String,
    pub snippet: String,
    pub flags: Vec<String>,
    pub has_attachments: bool,
}

#[derive(Deserialize)]
pub struct SearchFilters {
    pub sender: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub has_attachments: Option<bool>,
    pub folder_ids: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct SearchHistoryEntry {
    pub query: String,
    pub last_used_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EmailAction {
    MarkRead,
    MarkUnread,
    Flag,
    Unflag,
    Delete,
    Archive,
}

#[derive(Deserialize)]
pub struct EmailActionRequest {
    pub account_email: String,
    pub folder_id: String,
    pub uids: Vec<String>,
    pub action: EmailAction,
}

#[derive(Serialize)]
pub struct EmailActionFailure {
    pub uid: String,
    pub reason: String,
}

#[derive(Serialize)]
pub struct EmailActionResult {
    pub processed: usize,
    pub failed: Vec<EmailActionFailure>,
}

#[derive(Serialize)]
pub struct MoveEmailFailure {
    pub uid: String,
    pub reason: String,
}

#[derive(Serialize)]
pub struct MoveEmailResult {
    pub moved: usize,
    pub failed: Vec<MoveEmailFailure>,
}

#[derive(Serialize)]
pub struct EmailActionError {
    pub code: String,
    pub message: String,
}

impl EmailActionError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Serialize)]
pub struct SendEmailResponse {
    pub message: String,
    pub message_id: String,
}

#[derive(Serialize)]
pub struct SendEmailError {
    pub code: String,
    pub message: String,
}

impl SendEmailError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

fn normalize_recipients(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReplyForwardMode {
    Reply,
    Forward,
}

#[derive(Serialize)]
pub struct ReplyForwardDraft {
    pub subject: String,
    pub to: Vec<String>,
    pub cc: Vec<String>,
    pub body: String,
}

fn find_header_value(headers: &[EmailHeader], key: &str) -> Option<String> {
    headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case(key))
        .map(|header| header.value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn split_header_addresses(value: Option<String>) -> Vec<String> {
    value
        .map(|header| {
            normalize_recipients(
                header
                    .split(',')
                    .map(|entry| entry.trim().to_string())
                    .collect(),
            )
        })
        .unwrap_or_default()
}

fn subject_with_prefix(subject: &str, mode: &ReplyForwardMode) -> String {
    let trimmed = subject.trim();
    let lower = trimmed.to_lowercase();
    match mode {
        ReplyForwardMode::Reply => {
            if lower.starts_with("re:") {
                trimmed.to_string()
            } else {
                format!("Re: {}", trimmed)
            }
        }
        ReplyForwardMode::Forward => {
            if lower.starts_with("fwd:") || lower.starts_with("fw:") {
                trimmed.to_string()
            } else {
                format!("Fwd: {}", trimmed)
            }
        }
    }
}

fn build_quoted_body(
    mode: &ReplyForwardMode,
    from: &str,
    to: &str,
    cc: &str,
    subject: &str,
    date: &str,
    original_body: &str,
) -> String {
    let header_block = format!(
        "From: {}\nTo: {}\nCc: {}\nSubject: {}\nDate: {}\n\n{}",
        from, to, cc, subject, date, original_body
    );
    match mode {
        ReplyForwardMode::Reply => format!("\n\n---- Original Message ----\n{}", header_block),
        ReplyForwardMode::Forward => format!("\n\n---- Forwarded Message ----\n{}", header_block),
    }
}

fn find_folder_by_role<'a>(folders: &'a [FolderInfo], role: &str) -> Option<&'a FolderInfo> {
    folders.iter().find(|folder| {
        folder.system_role.as_deref() == Some(role)
            || folder.remote_id.eq_ignore_ascii_case(role)
    })
}

fn email_domain(email: &str) -> Result<&str, String> {
    email
        .split('@')
        .nth(1)
        .filter(|domain| !domain.trim().is_empty())
        .ok_or_else(|| "Invalid email address for auto discovery".to_string())
}

const DETAILS_CACHE_TTL_SECS: i64 = 600;

fn resolve_attachment_part_id(attachment_id: &str) -> &str {
    attachment_id
        .rsplit_once("::")
        .map(|(_, part)| part)
        .unwrap_or(attachment_id)
}

async fn load_search_results(
    db: &Database,
    account_id: &str,
    ids: Vec<String>,
) -> Result<Vec<EmailSummary>, String> {
    let mut results = Vec::new();
    for id in ids {
        if let Ok(email) = sqlx::query_as::<sqlx::Sqlite, (String, String, String, String, String, String, String)>(
            "
            SELECT remote_id, subject, sender, date, snippet, folder_id, flags 
            FROM emails 
            WHERE id = ?",
        )
        .bind(&id)
        .fetch_one(&db.pool)
        .await
        {
            let folder_belongs: Option<(i64,)> = sqlx::query_as(
                "SELECT 1 FROM folders WHERE id = ? AND account_id = ?"
            )
            .bind(&email.5)
            .bind(account_id)
            .fetch_optional(&db.pool)
            .await
            .unwrap_or(None);

            if folder_belongs.is_some() {
                let flags = serde_json::from_str(&email.6).unwrap_or_default();
                results.push(EmailSummary {
                    uid: email.0,
                    subject: email.1,
                    from: email.2,
                    date: email.3,
                    snippet: email.4,
                    flags,
                    message_id: None,
                });
            }
        }
    }
    Ok(results)
}

async fn update_local_flag(
    db: &Database,
    folder_id: &str,
    uid: &str,
    flag: &str,
    value: bool,
) -> Result<(), String> {
    if let Ok((flags_json,)) = sqlx::query_as::<_, (String,)>(
        "SELECT flags FROM emails WHERE folder_id = ? AND remote_id = ?",
    )
    .bind(folder_id)
    .bind(uid)
    .fetch_one(&db.pool)
    .await
    {
        let mut flags: Vec<String> = serde_json::from_str(&flags_json).unwrap_or_default();
        if value {
            if !flags.contains(&flag.to_string()) {
                flags.push(flag.to_string());
            }
        } else {
            flags.retain(|f| f != flag);
        }
        let new_flags_json = serde_json::to_string(&flags).unwrap_or_else(|_| "[]".to_string());
        let _ = sqlx::query("UPDATE emails SET flags = ? WHERE folder_id = ? AND remote_id = ?")
            .bind(new_flags_json)
            .bind(folder_id)
            .bind(uid)
            .execute(&db.pool)
            .await;
        let _ = db.update_folder_unread_count(folder_id).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_accounts_detailed(db: State<'_, Database>) -> Result<Vec<AccountInfo>, String> {
    db.get_accounts_detailed().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_account_details(
    db: State<'_, Database>,
    email: String,
    display_name: Option<String>,
    imap_host: String,
    imap_port: u16,
    imap_use_tls: bool,
    smtp_host: String,
    smtp_port: u16,
    smtp_use_tls: bool,
) -> Result<(), String> {
    validate_account_update(&email, &imap_host, &smtp_host)?;
    db.upsert_account(
        &email,
        display_name.as_deref(),
        &imap_host,
        imap_port,
        imap_use_tls,
        &smtp_host,
        smtp_port,
        smtp_use_tls,
    )
    .await
    .map(|_| ())
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn update_account_password(
    email: String,
    password: String,
) -> Result<(), String> {
    SecurityService::set_password(&email, &password)
        .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn test_account_connection(
    imap_host: String,
    imap_port: u16,
    imap_use_tls: bool,
    smtp_host: String,
    smtp_port: u16,
    smtp_use_tls: bool,
    email: String,
    password: Option<String>,
) -> Result<(), String> {
    crate::info!("Testing connection for {}", email);
    let pass = resolve_account_test_password(&email, password)?;

    // 1. 测试 IMAP
    let mut imap_client = RealImapClient::new(&imap_host, imap_port, &email, imap_use_tls);
    imap_client
        .connect()
        .await
        .map_err(|e| format!("IMAP Connection Failed: {}", e))?;
    imap_client
        .login(&email, &pass)
        .await
        .map_err(|e| format!("IMAP Login Failed: {}", e))?;
    crate::info!("IMAP test success for {}", email);

    // 2. 测试 SMTP
    let smtp_client = RealSmtpClient::new(&smtp_host, smtp_port, smtp_use_tls);
    smtp_client
        .test_connectivity()
        .map_err(|e| format!("SMTP Connection Failed: {}", e))?;
    crate::info!("SMTP test success for {}", email);

    Ok(())
}

#[tauri::command]
pub async fn discover_account_settings(
    db: State<'_, Database>,
    email: String,
) -> Result<AccountDiscoveryResult, String> {
    let domain = email_domain(&email)?.to_string();

    if let Some(existing) = db
        .find_account_by_domain(&domain)
        .await
        .map_err(|e| e.to_string())?
    {
        return Ok(AccountDiscoveryResult {
            email,
            source: "existing-account-domain".to_string(),
            requires_confirmation: false,
            imap_host: existing.imap_host,
            imap_port: existing.imap_port as u16,
            imap_use_tls: existing.imap_use_tls,
            smtp_host: existing.smtp_host,
            smtp_port: existing.smtp_port as u16,
            smtp_use_tls: existing.smtp_use_tls,
        });
    }

    Ok(AccountDiscoveryResult {
        email,
        source: "placeholder-domain-rule".to_string(),
        requires_confirmation: true,
        imap_host: format!("imap.{}", domain),
        imap_port: 993,
        imap_use_tls: true,
        smtp_host: format!("smtp.{}", domain),
        smtp_port: 465,
        smtp_use_tls: true,
    })
}

#[tauri::command]
pub async fn list_accounts(db: State<'_, Database>) -> Result<Vec<String>, String> {
    sqlx::query_as::<sqlx::Sqlite, (String,)>("SELECT email FROM accounts")
        .fetch_all(&db.pool)
        .await
        .map(|rows| rows.into_iter().map(|r| r.0).collect())
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
pub async fn sync_account(
    db: State<'_, Database>,
    engine: State<'_, SyncEngine>,
    email: String,
) -> Result<String, String> {
    let account = db
        .get_account_by_email(&email)
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| format!("Account not found: {}", email))?;

    let password = SecurityService::get_password(&email)
        .map_err(|e: anyhow::Error| e.to_string())?;

    let mut client = RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account.email,
        account.imap_use_tls,
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client
        .login(&account.email, &password)
        .await
        .map_err(|e| e.to_string())?;

    // One-time cleanup for legacy data without system_role
    if !db.has_any_system_roles(&account.id).await.unwrap_or(false) {
        crate::info!("Legacy folder data detected for {}, performing one-time cleanup", email);
        let _ = db.delete_all_folders_for_account(&account.id).await;
    }

    // IMAP LIST logic to align folders dynamically
    let remote_folders = client.get_folders().await.map_err(|e| e.to_string())?;
    let db_folders_initial = db.get_folders_for_account(&account.id).await.map_err(|e| e.to_string())?;
    
    let remote_ids: std::collections::HashSet<String> = remote_folders.iter().map(|f| f.remote_id.clone()).collect();
    let _local_ids: std::collections::HashSet<String> = db_folders_initial.iter().map(|f| f.remote_id.clone()).collect();

    // 1. Add/Update Folders
    for remote_f in remote_folders {
        crate::info!("Syncing remote folder: {} (Role: {:?})", remote_f.remote_id, remote_f.system_role);
        let _ = db.upsert_folder(
            &account.id, 
            &remote_f.remote_id, 
            &remote_f.name, 
            0, 
            remote_f.system_role.as_deref()
        ).await;
    }

    // 2. Delete Excess (non-system)
    let system_folders = ["INBOX", "SENT", "DRAFTS", "SPAM", "TRASH", "ARCHIVE"];
    for local_f in db_folders_initial {
        if !remote_ids.contains(&local_f.remote_id) {
            let upper = local_f.remote_id.to_uppercase();
            if !system_folders.contains(&upper.as_str()) {
                crate::info!("Deleting obsolete remote folder: {}", local_f.remote_id);
                let _ = db.delete_folder(&local_f.id).await;
            }
        }
    }

    // Fetch aligned folders to begin email sync
    let db_folders = db.get_folders_for_account(&account.id).await.map_err(|e| e.to_string())?;
    let mut has_errors = false;
    for db_folder in db_folders {
        let folder = traits::FolderInfo {
            id: db_folder.id,
            remote_id: db_folder.remote_id,
            name: db_folder.name,
            unread_count: db_folder.unread_count as u32,
            system_role: db_folder.system_role,
        };
        
        if let Err(e) = engine.sync_emails::<RealImapClient>(&mut client, &folder.id, &folder.remote_id).await {
            crate::error!("Failed to sync folder {}: {}", folder.remote_id, e);
            has_errors = true;
            continue;
        }
        
        if let Err(e) = engine.prune_deleted_emails::<RealImapClient>(&mut client, &folder.id, &folder.remote_id).await {
            crate::error!("Failed to prune folder {}: {}", folder.remote_id, e);
            has_errors = true;
            continue;
        }
    }

    if has_errors {
        Ok(format!("Account {} synced with some folder errors (check logs)", email))
    } else {
        Ok(format!("Account {} synced successfully", email))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_account_test_password_from_argument() {
        let password = resolve_account_test_password("demo@nexus-mail.com", Some("secret".to_string()))
            .unwrap();
        assert_eq!(password, "secret");
    }

    #[test]
    fn test_resolve_account_test_password_requires_existing_secret() {
        let email = "missing-password@nexus-mail.local";
        SecurityService::delete_password(email).ok();

        let err = resolve_account_test_password(email, None).unwrap_err();
        assert!(err.contains("Missing password"));
    }

    #[test]
    fn test_email_domain_validation() {
        assert_eq!(email_domain("demo@example.com").unwrap(), "example.com");
        assert!(email_domain("invalid-email").is_err());
    }

    #[test]
    fn test_resolve_attachment_part_id() {
        assert_eq!(resolve_attachment_part_id("email-123::1.2"), "1.2");
        assert_eq!(resolve_attachment_part_id("1.3"), "1.3");
    }

    #[test]
    fn test_subject_with_prefix_reply() {
        let subject = subject_with_prefix("Weekly Update", &ReplyForwardMode::Reply);
        assert_eq!(subject, "Re: Weekly Update");
        let subject = subject_with_prefix("Re: Weekly Update", &ReplyForwardMode::Reply);
        assert_eq!(subject, "Re: Weekly Update");
    }

    #[test]
    fn test_split_header_addresses_trims() {
        let addresses =
            split_header_addresses(Some("a@test.com, b@test.com  ,".to_string()));
        assert_eq!(
            addresses,
            vec!["a@test.com".to_string(), "b@test.com".to_string()]
        );
    }
}

#[tauri::command]
pub async fn get_email_details(
    db: State<'_, Database>,
    account_email: String,
    folder_id: String,
    uid: String,
) -> Result<crate::core::traits::EmailDetails, String> {
    let account = db
        .get_account_by_email(&account_email)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    let folder_row: (String,) = sqlx::query_as("SELECT remote_id FROM folders WHERE id = ?")
        .bind(&folder_id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let cached_row: Option<(String, Option<String>, Option<String>, Option<String>, Option<i64>)> =
        sqlx::query_as(
            "SELECT id, body_html, body_text, headers, detail_cached_at
             FROM emails
             WHERE folder_id = ? AND remote_id = ?",
        )
        .bind(&folder_id)
        .bind(&uid)
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| e.to_string())?;
    let email_id = cached_row.as_ref().map(|row| row.0.clone());
    let now = chrono::Utc::now().timestamp();

    if let Some((email_id, body_html, body_text, headers_json, cached_at)) = cached_row.as_ref() {
        if let Some(cached_at) = cached_at {
            let is_fresh = now.saturating_sub(*cached_at) <= DETAILS_CACHE_TTL_SECS;
            if is_fresh && (body_html.is_some() || body_text.is_some()) && headers_json.is_some() {
                let headers: Vec<EmailHeader> = headers_json
                    .as_ref()
                    .and_then(|json| serde_json::from_str(json).ok())
                    .unwrap_or_default();
                let attachments = sqlx::query_as::<sqlx::Sqlite, (String, String, String, i64, Option<String>, i64)>(
                    "SELECT id, filename, mime_type, size, content_id, is_inline
                     FROM attachments
                     WHERE email_id = ?",
                )
                .bind(email_id)
                .fetch_all(&db.pool)
                .await
                .map_err(|e| e.to_string())?
                .into_iter()
                .map(|(id, filename, mime_type, size, content_id, is_inline)| AttachmentInfo {
                    id,
                    filename,
                    mime_type,
                    size: size as usize,
                    content_id,
                    is_inline: is_inline != 0,
                })
                .collect();

                return Ok(traits::EmailDetails {
                    uid: uid.clone(),
                    body_html: body_html.clone(),
                    body_text: body_text.clone(),
                    attachments,
                    headers,
                });
            }
        }
    }

    let password = SecurityService::get_password(&account_email)
        .map_err(|e: anyhow::Error| e.to_string())?;

    let mut client = RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account_email,
        account.imap_use_tls,
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client
        .login(&account_email, &password)
        .await
        .map_err(|e| e.to_string())?;

    let details = client
        .get_email_details(&folder_row.0, &uid)
        .await
        .map_err(|e| e.to_string())?;

    let traits::EmailDetails {
        uid,
        body_html,
        body_text,
        attachments: raw_attachments,
        headers,
    } = details;

    let attachments = if let Some(email_id) = email_id {
        let headers_json = serde_json::to_string(&headers).unwrap_or_else(|_| "[]".to_string());
        if let Err(e) = sqlx::query(
            "UPDATE emails SET body_html = ?, body_text = ?, headers = ?, detail_cached_at = ? WHERE id = ?",
        )
        .bind(&body_html)
        .bind(&body_text)
        .bind(&headers_json)
        .bind(now)
        .bind(&email_id)
        .execute(&db.pool)
        .await
        {
            crate::error!("Failed to cache email details {}: {}", uid, e);
        }
        let fts_body = body_text
            .as_deref()
            .or(body_html.as_deref())
            .unwrap_or("");
        let _ = sqlx::query(
            "UPDATE emails_fts SET body_text = ?, folder_id = (SELECT folder_id FROM emails WHERE id = ?) WHERE id = ?",
        )
        .bind(fts_body)
        .bind(&email_id)
        .bind(&email_id)
        .execute(&db.pool)
        .await;

        if let Err(e) = sqlx::query("DELETE FROM attachments WHERE email_id = ?")
            .bind(&email_id)
            .execute(&db.pool)
            .await
        {
            crate::error!("Failed to reset attachments for {}: {}", uid, e);
        }

        let mut attachments = Vec::with_capacity(raw_attachments.len());
        for attachment in raw_attachments {
            let composite_id = format!("{}::{}", email_id, attachment.id);
            if let Err(e) = sqlx::query(
                "INSERT INTO attachments (id, email_id, filename, mime_type, size, content_id, is_inline)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&composite_id)
            .bind(&email_id)
            .bind(&attachment.filename)
            .bind(&attachment.mime_type)
            .bind(attachment.size as i64)
            .bind(&attachment.content_id)
            .bind(attachment.is_inline)
            .execute(&db.pool)
            .await
            {
                crate::error!("Failed to cache attachment {}: {}", uid, e);
            }
            attachments.push(AttachmentInfo {
                id: composite_id,
                filename: attachment.filename,
                mime_type: attachment.mime_type,
                size: attachment.size,
                content_id: attachment.content_id,
                is_inline: attachment.is_inline,
            });
        }
        attachments
    } else {
        raw_attachments
    };

    Ok(traits::EmailDetails {
        uid,
        body_html,
        body_text,
        attachments,
        headers,
    })
}

#[tauri::command]
pub async fn get_folders(
    db: State<'_, Database>,
    account_email: String,
) -> Result<Vec<FolderInfo>, String> {
    sqlx::query_as::<sqlx::Sqlite, (String, String, String, i64, Option<String>)>(
        "
        SELECT folders.id, remote_id, name, unread_count, system_role
        FROM folders
        JOIN accounts ON folders.account_id = accounts.id
        WHERE accounts.email = ?
        ORDER BY CASE UPPER(system_role)
            WHEN 'INBOX' THEN 0
            WHEN 'SENT' THEN 1
            WHEN 'DRAFTS' THEN 2
            WHEN 'SPAM' THEN 3
            WHEN 'TRASH' THEN 4
            WHEN 'ARCHIVE' THEN 5
            ELSE 6
        END,
        LOWER(name)",
    )
    .bind(account_email)
    .fetch_all(&db.pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|(id, remote_id, name, unread_count, system_role)| FolderInfo {
                id,
                name,
                remote_id,
                unread_count: unread_count as u32,
                system_role,
            })
            .collect()
    })
    .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
pub async fn get_emails(
    db: State<'_, Database>,
    folder_id: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<EmailListItem>, String> {
    let page_limit = if limit == 0 { 50 } else { limit.min(50) };
    sqlx::query_as::<sqlx::Sqlite, (String, String, String, String, String, String, i64)>(
        "
        SELECT remote_id, subject, sender, date, snippet, flags,
            EXISTS(SELECT 1 FROM attachments WHERE attachments.email_id = emails.id) AS has_attachments
        FROM emails
        WHERE folder_id = ? 
        ORDER BY
            CASE
                WHEN remote_id != '' AND remote_id NOT GLOB '*[^0-9]*' THEN CAST(remote_id AS INTEGER)
                ELSE NULL
            END DESC,
            id DESC
        LIMIT ? OFFSET ?",
    )
    .bind(folder_id)
    .bind(page_limit as i64)
    .bind(offset as i64)
    .fetch_all(&db.pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|(uid, subject, from, date, snippet, flags_json, has_attachments)| {
                let flags = serde_json::from_str(&flags_json).unwrap_or_default();
                EmailListItem {
                    uid,
                    subject,
                    from,
                    date,
                    snippet,
                    flags,
                    has_attachments: has_attachments != 0,
                }
            })
            .collect()
    })
    .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
pub async fn search_emails(
    db: State<'_, Database>,
    account_email: String,
    query: String,
) -> Result<Vec<EmailSummary>, String> {
    let account = db
        .get_account_by_email(&account_email)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    db.record_search_history(&account.id, &query)
        .await
        .map_err(|e| e.to_string())?;

    let ids = db.search_emails(&query).await.map_err(|e| e.to_string())?;
    load_search_results(&db, &account.id, ids).await
}

#[tauri::command]
pub async fn search_emails_with_filters(
    db: State<'_, Database>,
    account_email: String,
    query: String,
    filters: Option<SearchFilters>,
) -> Result<Vec<EmailSummary>, String> {
    let account = db
        .get_account_by_email(&account_email)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    db.record_search_history(&account.id, &query)
        .await
        .map_err(|e| e.to_string())?;

    let sender = filters.as_ref().and_then(|filter| filter.sender.as_deref());
    let start_date = filters.as_ref().and_then(|filter| filter.start_date.as_deref());
    let end_date = filters.as_ref().and_then(|filter| filter.end_date.as_deref());
    let has_attachments = filters.as_ref().and_then(|filter| filter.has_attachments);
    let folder_ids = filters
        .as_ref()
        .and_then(|filter| filter.folder_ids.as_ref())
        .map(|values| values.as_slice());

    let ids = db
        .search_emails_filtered(
            &account.id,
            &query,
            sender,
            start_date,
            end_date,
            has_attachments,
            folder_ids,
        )
        .await
        .map_err(|e| e.to_string())?;

    load_search_results(&db, &account.id, ids).await
}

#[tauri::command]
pub async fn get_search_history(
    db: State<'_, Database>,
    account_email: String,
) -> Result<Vec<SearchHistoryEntry>, String> {
    let account = db
        .get_account_by_email(&account_email)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    db.get_search_history(&account.id)
        .await
        .map(|rows| {
            rows.into_iter()
                .map(|(query, last_used_at)| SearchHistoryEntry { query, last_used_at })
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_search_history(
    db: State<'_, Database>,
    account_email: String,
) -> Result<(), String> {
    let account = db
        .get_account_by_email(&account_email)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    db.clear_search_history(&account.id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_email(
    db: State<'_, Database>,
    mut request: SendEmailRequest,
) -> Result<SendEmailResponse, SendEmailError> {
    request.to = normalize_recipients(request.to);
    request.cc = normalize_recipients(request.cc);
    request.bcc = normalize_recipients(request.bcc);
    request.attachments = normalize_recipients(request.attachments);

    if request.to.is_empty() && request.cc.is_empty() && request.bcc.is_empty() {
        return Err(SendEmailError::new(
            "missing_recipient",
            "At least one recipient is required",
        ));
    }

    let account = db
        .get_account_by_email(&request.from)
        .await
        .map_err(|e| SendEmailError::new("account_lookup_failed", e.to_string()))?
        .ok_or_else(|| SendEmailError::new("account_not_found", "Account not found"))?;

    let smtp_client = RealSmtpClient::new(
        &account.smtp_host, 
        account.smtp_port as u16,
        account.smtp_use_tls
    );

    let result = match smtp_client.send_email(&request).await {
        Ok(result) => result,
        Err(error) => {
            let mut draft_saved = false;
            if let Ok(folders) = db.get_folders_for_account(&account.id).await {
                if let Some(draft_folder) = find_folder_by_role(&folders, "DRAFTS") {
                    let local_uid = format!(
                        "local-draft-{}",
                        uuid::Uuid::new_v4().to_string().replace("-", "")
                    );
                    let summary = crate::core::traits::EmailSummary {
                        uid: local_uid,
                        subject: request.subject.clone(),
                        from: request.from.clone(),
                        date: chrono::Local::now().to_rfc2822(),
                        snippet: request.body.chars().take(100).collect(),
                        flags: vec![],
                        message_id: None,
                    };
                    if db.upsert_email(&draft_folder.id, &summary).await.is_ok() {
                        draft_saved = true;
                    }
                }
            }
            let error_message = if draft_saved {
                format!("SMTP send failed; draft saved: {}", error)
            } else {
                format!("SMTP send failed: {}", error)
            };
            return Err(SendEmailError::new(
                if draft_saved {
                    "smtp_error_draft_saved"
                } else {
                    "smtp_error"
                },
                error_message,
            ));
        }
    };

    let mut sent_sync_failed = false;
    if let Ok(folders) = db.get_folders_for_account(&account.id).await {
        if let Some(sent_folder) = find_folder_by_role(&folders, "SENT") {
            let local_uid = format!(
                "local-sent-{}",
                uuid::Uuid::new_v4().to_string().replace("-", "")
            );
            let summary = crate::core::traits::EmailSummary {
                uid: local_uid,
                subject: request.subject.clone(),
                from: request.from.clone(),
                date: chrono::Local::now().to_rfc2822(),
                snippet: request.body.chars().take(100).collect(),
                flags: vec!["\\Seen".to_string()],
                message_id: Some(result.message_id.clone()),
            };
            let _ = db.upsert_email(&sent_folder.id, &summary).await;

            match SecurityService::get_password(&request.from) {
                Ok(password) => {
                    let mut client = RealImapClient::new(
                        &account.imap_host,
                        account.imap_port as u16,
                        &request.from,
                        account.imap_use_tls,
                    );
                    if client.connect().await.is_ok()
                        && client.login(&request.from, &password).await.is_ok()
                    {
                        if client
                            .append_message(&sent_folder.remote_id, &result.raw)
                            .await
                            .is_err()
                        {
                            sent_sync_failed = true;
                        }
                    } else {
                        sent_sync_failed = true;
                    }
                }
                Err(_) => {
                    sent_sync_failed = true;
                }
            }
        }
    }

    Ok(SendEmailResponse {
        message: if sent_sync_failed {
            format!(
                "Email sent to {} successfully (sent folder sync failed)",
                request.to.join(", ")
            )
        } else {
            format!(
                "Email sent to {} successfully (synced to Sent)",
                request.to.join(", ")
            )
        },
        message_id: result.message_id,
    })
}

#[tauri::command]
pub async fn prepare_reply_forward(
    db: State<'_, Database>,
    account_email: String,
    folder_id: String,
    uid: String,
    mode: ReplyForwardMode,
) -> Result<ReplyForwardDraft, String> {
    let account = db
        .get_account_by_email(&account_email)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    let folder_row: (String,) = sqlx::query_as("SELECT remote_id FROM folders WHERE id = ?")
        .bind(&folder_id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let password = SecurityService::get_password(&account_email)
        .map_err(|e: anyhow::Error| e.to_string())?;

    let mut client = RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account_email,
        account.imap_use_tls,
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client
        .login(&account_email, &password)
        .await
        .map_err(|e| e.to_string())?;

    let details = client
        .get_email_details(&folder_row.0, &uid)
        .await
        .map_err(|e| e.to_string())?;

    let from_header = find_header_value(&details.headers, "From").unwrap_or_default();
    let to_header = find_header_value(&details.headers, "To").unwrap_or_default();
    let cc_header = find_header_value(&details.headers, "Cc").unwrap_or_default();
    let subject_header = find_header_value(&details.headers, "Subject").unwrap_or_default();
    let date_header = find_header_value(&details.headers, "Date").unwrap_or_default();

    let recipients_to = match mode {
        ReplyForwardMode::Reply => split_header_addresses(Some(from_header.clone())),
        ReplyForwardMode::Forward => vec![],
    };
    let recipients_cc = match mode {
        ReplyForwardMode::Reply => split_header_addresses(Some(cc_header.clone())),
        ReplyForwardMode::Forward => vec![],
    };

    let subject = subject_with_prefix(&subject_header, &mode);
    let body_source = details
        .body_text
        .as_ref()
        .or(details.body_html.as_ref())
        .map(|body| body.as_str())
        .unwrap_or("");
    let body = build_quoted_body(
        &mode,
        &from_header,
        &to_header,
        &cc_header,
        &subject_header,
        &date_header,
        body_source,
    );

    Ok(ReplyForwardDraft {
        subject,
        to: recipients_to,
        cc: recipients_cc,
        body,
    })
}

#[tauri::command]
pub async fn get_attachment(
    db: State<'_, Database>,
    account_email: String,
    folder_id: String,
    uid: String,
    attachment_id: String,
) -> Result<Vec<u8>, String> {
    let account = db
        .get_account_by_email(&account_email)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    let password = SecurityService::get_password(&account_email)
        .map_err(|e: anyhow::Error| e.to_string())?;

    let folder_row: (String,) = sqlx::query_as("SELECT remote_id FROM folders WHERE id = ?")
        .bind(&folder_id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut client = RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account_email,
        account.imap_use_tls,
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client
        .login(&account_email, &password)
        .await
        .map_err(|e| e.to_string())?;

    let part_id = resolve_attachment_part_id(&attachment_id);

    let data = client
        .get_attachment(&folder_row.0, &uid, part_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(data)
}

#[tauri::command]
pub async fn update_email_flag(
    db: State<'_, Database>,
    account_email: String,
    folder_id: String,
    uid: String,
    flag: String,
    value: bool,
) -> Result<(), String> {
    let account = db
        .get_account_by_email(&account_email)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    let password = SecurityService::get_password(&account_email)
        .map_err(|e: anyhow::Error| e.to_string())?;

    let folder_row: (String,) = sqlx::query_as("SELECT remote_id FROM folders WHERE id = ?")
        .bind(&folder_id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut client = RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account_email,
        account.imap_use_tls,
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client
        .login(&account_email, &password)
        .await
        .map_err(|e| e.to_string())?;

    client
        .set_flag(&folder_row.0, &uid, &flag, value)
        .await
        .map_err(|e| e.to_string())?;

    if let Ok((flags_json,)) = sqlx::query_as::<_, (String,)>("SELECT flags FROM emails WHERE folder_id = ? AND remote_id = ?")
        .bind(&folder_id)
        .bind(&uid)
        .fetch_one(&db.pool)
        .await
    {
        let mut flags: Vec<String> = serde_json::from_str(&flags_json).unwrap_or_default();
        if value {
            if !flags.contains(&flag) {
                flags.push(flag.clone());
            }
        } else {
            flags.retain(|f| f != &flag);
        }
        let new_flags_json = serde_json::to_string(&flags).unwrap_or_else(|_| "[]".to_string());
        
        let _ = sqlx::query("UPDATE emails SET flags = ? WHERE folder_id = ? AND remote_id = ?")
            .bind(new_flags_json)
            .bind(&folder_id)
            .bind(&uid)
            .execute(&db.pool)
            .await;
            
        let _ = db.update_folder_unread_count(&folder_id).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn apply_email_action(
    db: State<'_, Database>,
    request: EmailActionRequest,
) -> Result<EmailActionResult, EmailActionError> {
    let account = db
        .get_account_by_email(&request.account_email)
        .await
        .map_err(|e| EmailActionError::new("account_lookup_failed", e.to_string()))?
        .ok_or_else(|| EmailActionError::new("account_not_found", "Account not found"))?;

    let password = SecurityService::get_password(&request.account_email)
        .map_err(|e: anyhow::Error| EmailActionError::new("missing_password", e.to_string()))?;

    let folder_row: (String,) = sqlx::query_as(
        "SELECT remote_id FROM folders WHERE id = ? AND account_id = ?",
    )
    .bind(&request.folder_id)
    .bind(&account.id)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| EmailActionError::new("folder_not_found", e.to_string()))?;

    let mut client = RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &request.account_email,
        account.imap_use_tls,
    );
    client
        .connect()
        .await
        .map_err(|e| EmailActionError::new("imap_connect_failed", e.to_string()))?;
    client
        .login(&request.account_email, &password)
        .await
        .map_err(|e| EmailActionError::new("imap_login_failed", e.to_string()))?;

    let mut failed = Vec::new();
    let mut processed = 0;
    for uid in &request.uids {
        let result = match request.action {
            EmailAction::MarkRead => {
                if let Err(e) = client.set_flag(&folder_row.0, uid, "\\Seen", true).await {
                    Err(e.to_string())
                } else {
                    update_local_flag(&db, &request.folder_id, uid, "\\Seen", true).await
                }
            }
            EmailAction::MarkUnread => {
                if let Err(e) = client.set_flag(&folder_row.0, uid, "\\Seen", false).await {
                    Err(e.to_string())
                } else {
                    update_local_flag(&db, &request.folder_id, uid, "\\Seen", false).await
                }
            }
            EmailAction::Flag => {
                if let Err(e) = client.set_flag(&folder_row.0, uid, "\\Flagged", true).await {
                    Err(e.to_string())
                } else {
                    update_local_flag(&db, &request.folder_id, uid, "\\Flagged", true).await
                }
            }
            EmailAction::Unflag => {
                if let Err(e) = client.set_flag(&folder_row.0, uid, "\\Flagged", false).await {
                    Err(e.to_string())
                } else {
                    update_local_flag(&db, &request.folder_id, uid, "\\Flagged", false).await
                }
            }
            EmailAction::Archive => {
                if let Err(e) = client.set_flag(&folder_row.0, uid, "\\Archived", true).await {
                    Err(e.to_string())
                } else {
                    update_local_flag(&db, &request.folder_id, uid, "\\Archived", true).await
                }
            }
            EmailAction::Delete => {
                if let Err(e) = client.delete_email(&folder_row.0, uid).await {
                    Err(e.to_string())
                } else if let Err(e) = db.delete_email_by_uid(&request.folder_id, uid).await {
                    Err(e.to_string())
                } else {
                    db.update_folder_unread_count(&request.folder_id)
                        .await
                        .map_err(|e| e.to_string())
                }
            }
        };

        match result {
            Ok(()) => processed += 1,
            Err(err) => failed.push(EmailActionFailure {
                uid: uid.clone(),
                reason: err,
            }),
        }
    }

    Ok(EmailActionResult { processed, failed })
}

#[tauri::command]
pub async fn move_emails(
    db: State<'_, Database>,
    account_email: String,
    source_folder_id: String,
    target_folder_id: String,
    uids: Vec<String>,
) -> Result<MoveEmailResult, String> {
    let account = db
        .get_account_by_email(&account_email)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    let password = SecurityService::get_password(&account_email)
        .map_err(|e: anyhow::Error| e.to_string())?;

    let source_row: (String,) = sqlx::query_as(
        "SELECT remote_id FROM folders WHERE id = ? AND account_id = ?",
    )
    .bind(&source_folder_id)
    .bind(&account.id)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| e.to_string())?;

    let target_row: (String,) = sqlx::query_as(
        "SELECT remote_id FROM folders WHERE id = ? AND account_id = ?",
    )
    .bind(&target_folder_id)
    .bind(&account.id)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut client = RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account_email,
        account.imap_use_tls,
    );
    client.connect().await.map_err(|e| e.to_string())?;
    client
        .login(&account_email, &password)
        .await
        .map_err(|e| e.to_string())?;

    let mut failed = Vec::new();
    let mut moved = 0;
    for uid in &uids {
        match client
            .move_email(&source_row.0, uid, &target_row.0)
            .await
        {
            Ok(()) => {
                if let Err(e) = db.delete_email_by_uid(&source_folder_id, uid).await {
                    failed.push(MoveEmailFailure {
                        uid: uid.clone(),
                        reason: e.to_string(),
                    });
                } else {
                    moved += 1;
                }
            }
            Err(e) => failed.push(MoveEmailFailure {
                uid: uid.clone(),
                reason: e.to_string(),
            }),
        }
    }

    if moved > 0 {
        let _ = db.update_folder_unread_count(&source_folder_id).await;
        let _ = db.update_folder_unread_count(&target_folder_id).await;
    }

    Ok(MoveEmailResult { moved, failed })
}

#[tauri::command]
pub async fn delete_email(
    db: State<'_, Database>,
    account_email: String,
    folder_id: String,
    uid: String,
) -> Result<(), String> {
    let account = db
        .get_account_by_email(&account_email)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    let password = SecurityService::get_password(&account_email)
        .map_err(|e: anyhow::Error| e.to_string())?;

    let folder_row: (String,) = sqlx::query_as("SELECT remote_id FROM folders WHERE id = ?")
        .bind(&folder_id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut client = RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account_email,
        account.imap_use_tls,
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client
        .login(&account_email, &password)
        .await
        .map_err(|e| e.to_string())?;

    client
        .delete_email(&folder_row.0, &uid)
        .await
        .map_err(|e| e.to_string())?;

    db.delete_email_by_uid(&folder_id, &uid)
        .await
        .map_err(|e| e.to_string())?;

    let _ = db.update_folder_unread_count(&folder_id).await;

    Ok(())
}

#[tauri::command]
pub async fn reset_database(db: State<'_, Database>) -> Result<(), String> {
    sqlx::query("DELETE FROM emails").execute(&db.pool).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM folders").execute(&db.pool).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM accounts").execute(&db.pool).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM emails_fts").execute(&db.pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_settings(db: State<'_, Database>) -> Result<std::collections::HashMap<String, String>, String> {
    db.get_all_settings().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_setting(db: State<'_, Database>, key: String, value: String) -> Result<(), String> {
    db.set_setting(&key, &value).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dev_seed_data(db: State<'_, Database>) -> Result<String, String> {
    let email = "demo@nexus-mail.com";
    let acct_id = db
        .upsert_account(
            email,
            Some("Mock Testing"),
            "127.0.0.1",
            1993,
            false,
            "127.0.0.1",
            1465,
            false,
        )
        .await
        .map_err(|e| e.to_string())?;

    SecurityService::set_password(email, "pass").map_err(|e| e.to_string())?;

    let inbox_id = db.upsert_folder(&acct_id, "INBOX", "Inbox", 95, Some("INBOX")).await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "SENT", "Sent", 0, Some("SENT")).await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "TRASH", "Trash", 0, Some("TRASH")).await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "DRAFTS", "Drafts", 2, Some("DRAFTS")).await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "SPAM", "Spam", 5, Some("SPAM")).await.map_err(|e| e.to_string())?;

    for i in 1..=100 {
        let is_unread = i <= 95;
        let flags = if is_unread { vec![] } else { vec!["\\Seen".to_string()] };
        let summary = EmailSummary {
            uid: (1000 + i).to_string(),
            from: format!("sender-{}@mock.com", i),
            subject: format!("Nexus Mail Sample #{}", i),
            date: format!("{:02}:{:02} AM", 9 + (i/60), i % 60),
            snippet: format!("Mock message #{} which might contain more text to show the snippet logic in the email list item card.", i),
            flags,
            message_id: None,
        };
        db.upsert_email(&inbox_id, &summary).await.map_err(|e| e.to_string())?;
    }

    // 更新未读数
    db.update_folder_unread_count(&inbox_id).await.map_err(|e| e.to_string())?;

    Ok("Seed data injected!".into())
}
