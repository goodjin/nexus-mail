use crate::core::database::Database;
use crate::core::traits::{self, MailClient, MailSender, EmailSummary, FolderInfo, AccountInfo};
use crate::core::imap_client::RealImapClient;
use crate::core::smtp_client::RealSmtpClient;
use crate::core::sync_engine::SyncEngine;
use crate::core::security::SecurityService;
use anyhow::Result;
use tauri::State;

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

    let db_folders = db.get_folders_by_account(&account.id).await.map_err(|e| e.to_string())?;
    for db_folder in db_folders {
        let folder = traits::FolderInfo {
            id: db_folder.id,
            remote_id: db_folder.remote_id,
            name: db_folder.name,
            unread_count: db_folder.unread_count as u32,
        };
        engine.sync_emails::<RealImapClient>(&mut client, &folder.id, &folder.remote_id).await.map_err(|e| e.to_string())?;
        engine.prune_deleted_emails::<RealImapClient>(&mut client, &folder.id, &folder.remote_id).await.map_err(|e| e.to_string())?;
    }

    Ok(format!("Account {} synced successfully", email))
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
    sqlx::query_as::<sqlx::Sqlite, (String, String, String, i64)>(
        "
        SELECT folders.id, remote_id, name, unread_count 
        FROM folders 
        JOIN accounts ON folders.account_id = accounts.id 
        WHERE accounts.email = ?",
    )
    .bind(account_email)
    .fetch_all(&db.pool)
    .await
    .map(|rows| {
        rows.into_iter()
            .map(|(id, remote_id, name, unread_count)| FolderInfo {
                id,
                name,
                remote_id,
                unread_count: unread_count as u32,
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

    let msg_bytes = smtp_client
        .send_email(&from, &to, &subject, &body, attachments)
        .await
        .map_err(|e: anyhow::Error| format!("SMTP Error: {}", e))?;

    let password = SecurityService::get_password(&from)
        .map_err(|e: anyhow::Error| e.to_string())?;

    let mut imap_client = RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account.email,
        account.imap_use_tls,
    );

    if let Ok(_) = imap_client.connect().await {
        if let Ok(_) = imap_client.login(&account.email, &password).await {
            let _ = imap_client.append_message("SENT", &msg_bytes).await;
        }
    }

    Ok(format!("Email sent to {} successfully (with Fcc)", to))
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

    let inbox_id = db.upsert_folder(&acct_id, "INBOX", "Inbox", 95).await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "SENT", "Sent", 0).await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "TRASH", "Trash", 0).await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "DRAFTS", "Drafts", 2).await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "SPAM", "Spam", 5).await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "ARCHIVE", "Archive", 0).await.map_err(|e| e.to_string())?;

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
