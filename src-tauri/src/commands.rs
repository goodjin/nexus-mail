use tauri::State;
use crate::core::database::Database;
use crate::core::sync_engine::SyncEngine;
use crate::core::traits::{FolderInfo, EmailSummary, MailClient, MailSender};
use anyhow::Result;

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
    email: String
) -> Result<String, String> {
    // 1. 获取账户信息
    let account = db.get_account_by_email(&email).await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| format!("Account not found: {}", email))?;

    // 2. 获取密码
    let password = crate::core::security::SecurityService::get_password(&email)
        .map_err(|e| format!("Security error: {}", e))?;

    // 3. 初始化真实 IMAP 客户端并同步
    let mut client = crate::core::imap_client::RealImapClient::new(
        &account.imap_host, 
        account.imap_port as u16, 
        &account.email
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client.login(&account.email, &password).await.map_err(|e| e.to_string())?;

    let folders = db.get_folders_by_account(&account.id).await
        .map_err(|e| e.to_string())?;

    for folder in folders {
        engine.sync_emails(&mut client, &folder.id, &folder.remote_id)
            .await.map_err(|e| e.to_string())?;
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
    let account = db.get_account_by_email(&account_email).await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;
        
    let password = crate::core::security::SecurityService::get_password(&account_email)
        .map_err(|e| e.to_string())?;

    let folder_row: (String,) = sqlx::query_as("SELECT remote_id FROM folders WHERE id = ?")
        .bind(&folder_id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut client = crate::core::imap_client::RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account_email
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client.login(&account_email, &password).await.map_err(|e| e.to_string())?;

    let details = client.get_email_details(&folder_row.0, &uid).await
        .map_err(|e| e.to_string())?;

    Ok(details)
}
#[tauri::command]
pub async fn get_folders(db: State<'_, Database>, account_email: String) -> Result<Vec<FolderInfo>, String> {
    sqlx::query_as::<sqlx::Sqlite, (String, String, String, i64)>("
        SELECT folders.id, remote_id, name, unread_count 
        FROM folders 
        JOIN accounts ON folders.account_id = accounts.id 
        WHERE accounts.email = ?")
        .bind(account_email)
        .fetch_all(&db.pool)
        .await
        .map(|rows| rows.into_iter().map(|(id, remote_id, name, unread_count)| FolderInfo {
            id,
            name,
            remote_id,
            unread_count: unread_count as u32,
        }).collect())
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
pub async fn get_emails(
    db: State<'_, Database>, 
    folder_id: String, 
    limit: u32, 
    offset: u32
) -> Result<Vec<EmailSummary>, String> {
    sqlx::query_as::<sqlx::Sqlite, (String, String, String, String, String)>("
        SELECT remote_id, subject, sender, date, snippet 
        FROM emails 
        WHERE folder_id = ? 
        ORDER BY CAST(remote_id AS INTEGER) DESC 
        LIMIT ? OFFSET ?")
        .bind(folder_id)
        .bind(limit as i64)
        .bind(offset as i64)
        .fetch_all(&db.pool)
        .await
        .map(|rows| rows.into_iter().map(|(uid, subject, from, date, snippet)| EmailSummary {
            uid,
            subject,
            from,
            date,
            snippet,
        }).collect())
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
pub async fn search_emails(db: State<'_, Database>, query: String) -> Result<Vec<EmailSummary>, String> {
    let ids = db.search_emails(&query).await.map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for id in ids {
        if let Ok(email) = sqlx::query_as::<sqlx::Sqlite, (String, String, String, String, String)>("
            SELECT remote_id, subject, sender, date, snippet FROM emails WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await 
        {
            results.push(EmailSummary {
                uid: email.0,
                subject: email.1,
                from: email.2,
                date: email.3,
                snippet: email.4,
            });
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
    body: String
) -> Result<String, String> {
    // 1. 获取账户信息以获取 SMTP 配置
    let account = db.get_account_by_email(&from).await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| format!("Account not found: {}", from))?;

    // 2. 初始化 SMTP 客户端并发送
    let client = crate::core::smtp_client::RealSmtpClient::new(
        &account.smtp_host,
        account.smtp_port as u16
    );

    let password = crate::core::security::SecurityService::get_password(&from)
        .map_err(|e| e.to_string())?;

    // 实现发件逻辑
    client.send_email(&from, &to, &subject, &body).await
        .map_err(|e: anyhow::Error| e.to_string())?;

    Ok(format!("Email sent to {} successfully", to))
}

#[tauri::command]
pub async fn get_attachment(
    db: State<'_, Database>,
    account_email: String,
    folder_id: String,
    uid: String,
    attachment_id: String,
) -> Result<Vec<u8>, String> {
    let account = db.get_account_by_email(&account_email).await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;
        
    let password = crate::core::security::SecurityService::get_password(&account_email)
        .map_err(|e| e.to_string())?;

    let folder_row: (String,) = sqlx::query_as("SELECT remote_id FROM folders WHERE id = ?")
        .bind(&folder_id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut client = crate::core::imap_client::RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account_email
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client.login(&account_email, &password).await.map_err(|e| e.to_string())?;

    let data = client.get_attachment(&folder_row.0, &uid, &attachment_id).await
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
    let account = db.get_account_by_email(&account_email).await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;
        
    let password = crate::core::security::SecurityService::get_password(&account_email)
        .map_err(|e| e.to_string())?;

    let folder_row: (String,) = sqlx::query_as("SELECT remote_id FROM folders WHERE id = ?")
        .bind(&folder_id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut client = crate::core::imap_client::RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account_email
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client.login(&account_email, &password).await.map_err(|e| e.to_string())?;

    client.set_flag(&folder_row.0, &uid, &flag, value).await
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
    let account = db.get_account_by_email(&account_email).await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;
        
    let password = crate::core::security::SecurityService::get_password(&account_email)
        .map_err(|e| e.to_string())?;

    let folder_row: (String,) = sqlx::query_as("SELECT remote_id FROM folders WHERE id = ?")
        .bind(&folder_id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut client = crate::core::imap_client::RealImapClient::new(
        &account.imap_host,
        account.imap_port as u16,
        &account_email
    );

    client.connect().await.map_err(|e| e.to_string())?;
    client.login(&account_email, &password).await.map_err(|e| e.to_string())?;

    client.delete_email(&folder_row.0, &uid).await
        .map_err(|e| e.to_string())?;

    // 从本地 DB 删除
    sqlx::query("DELETE FROM emails WHERE folder_id = ? AND uid = ?")
        .bind(&folder_id)
        .bind(&uid)
        .execute(&db.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn dev_seed_data(db: State<'_, Database>) -> Result<String, String> {
    let email = "demo@nexus-mail.com";
    
    // 注入模拟账户 (指向本地 Mock 服务器)
    let acct_id = db.upsert_account(email, Some("Mock Testing"), "127.0.0.1", 1993, "127.0.0.1", 1465)
        .await.map_err(|e| e.to_string())?;

    // 注入文件夹
    let inbox_id = db.upsert_folder(&acct_id, "INBOX", "Inbox", 5)
        .await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "SENT", "Sent", 0)
        .await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "TRASH", "Trash", 0)
        .await.map_err(|e| e.to_string())?;
    db.upsert_folder(&acct_id, "DRAFTS", "Drafts", 2)
        .await.map_err(|e| e.to_string())?;

    // 注入 100 封模拟邮件
    for i in 1..=100 {
        let email = EmailSummary {
            uid: (1000 + i).to_string(),
            from: format!("sender-{}@mock.com", i),
            subject: format!("Nexus Mail Sample #{}", i),
            date: format!("{:02}:{:02} AM", 9 + (i/60), i % 60),
            snippet: format!("This is mock email content for message number {}. It is used to verify the 100-email load simulation.", i),
        };
        db.upsert_email(&inbox_id, &email).await.map_err(|e| e.to_string())?;
    }

    Ok("Seed data injected with security credentials!".into())
}
