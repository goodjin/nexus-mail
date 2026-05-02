use crate::core::database::Database;
use crate::core::traits::{self, MailClient, MailSender, EmailSummary, FolderInfo, AccountInfo};
use crate::core::imap_client::RealImapClient;
use crate::core::smtp_client::RealSmtpClient;
use crate::core::sync_engine::SyncEngine;
use crate::core::security::SecurityService;
use anyhow::Result;
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

    let details = client
        .get_email_details(&folder_row.0, &uid)
        .await
        .map_err(|e| e.to_string())?;

    Ok(details)
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
        WHERE accounts.email = ?",
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
) -> Result<Vec<EmailSummary>, String> {
    sqlx::query_as::<sqlx::Sqlite, (String, String, String, String, String, String)>(
        "
        SELECT remote_id, subject, sender, date, snippet, flags 
        FROM emails 
        WHERE folder_id = ? 
        ORDER BY CAST(remote_id AS INTEGER) DESC 
        LIMIT ? OFFSET ?",
    )
    .bind(folder_id)
    .bind(limit as i64)
    .bind(offset as i64)
    .fetch_all(&db.pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|(uid, subject, from, date, snippet, flags_json)| {
                let flags = serde_json::from_str(&flags_json).unwrap_or_default();
                EmailSummary {
                    uid,
                    subject,
                    from,
                    date,
                    snippet,
                    flags,
                    message_id: None,
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

    let ids = db.search_emails(&query).await.map_err(|e| e.to_string())?;

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
            // Verify folder belongs to account
            let folder_belongs: Option<(i64,)> = sqlx::query_as(
                "SELECT 1 FROM folders WHERE id = ? AND account_id = ?"
            )
            .bind(&email.5)
            .bind(&account.id)
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

#[tauri::command]
pub async fn send_email(
    db: State<'_, Database>,
    from: String,
    to: String,
    subject: String,
    body: String,
    attachments: Option<Vec<String>>,
) -> Result<String, String> {
    let account = db
        .get_account_by_email(&from)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    let attachments = attachments.unwrap_or_default();

    let smtp_client = RealSmtpClient::new(
        &account.smtp_host, 
        account.smtp_port as u16,
        account.smtp_use_tls
    );

    let (_, msg_id_val) = smtp_client
        .send_email(&from, &to, &subject, &body, attachments)
        .await
        .map_err(|e: anyhow::Error| format!("SMTP Error: {}", e))?;

    // Save to local Sent folder
    if let Ok(folders) = db.get_folders_for_account(&account.id).await {
        if let Some(sent_folder) = folders.iter().find(|f: &&FolderInfo| f.system_role.as_deref() == Some("SENT") || f.remote_id.eq_ignore_ascii_case("SENT")) {
            let local_uid = format!("local-sent-{}", uuid::Uuid::new_v4().to_string().replace("-", ""));
            let summary = crate::core::traits::EmailSummary {
                uid: local_uid,
                subject: subject.clone(),
                from: from.clone(),
                date: chrono::Local::now().to_rfc2822(),
                snippet: body.chars().take(100).collect(),
                flags: vec!["\\Seen".to_string()],
                message_id: Some(msg_id_val),
            };
            let _ = db.upsert_email(&sent_folder.id, &summary).await;
        }
    }

    Ok(format!("Email sent to {} successfully (local save only)", to))
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

    let data = client
        .get_attachment(&folder_row.0, &uid, &attachment_id)
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

    sqlx::query("DELETE FROM emails WHERE folder_id = ? AND remote_id = ?")
        .bind(&folder_id)
        .bind(&uid)
        .execute(&db.pool)
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

#[cfg(test)]
mod tests {

    #[tokio::test]
    async fn test_get_accounts() {
        // Mock tests here if needed
    }
}
