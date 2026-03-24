use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccountInfo {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub imap_host: String,
    pub imap_port: i64,
    pub imap_use_tls: bool,
    pub smtp_host: String,
    pub smtp_port: i64,
    pub smtp_use_tls: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderInfo {
    pub id: String,
    pub name: String,
    pub remote_id: String,
    pub unread_count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmailSummary {
    pub uid: String,
    pub subject: String,
    pub from: String,
    pub date: String,
    pub snippet: String,
    pub flags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmailDetails {
    pub uid: String,
    pub body_html: Option<String>,
    pub body_text: Option<String>,
    pub attachments: Vec<AttachmentInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AttachmentInfo {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: usize,
}

#[async_trait]
pub trait MailClient: Send + Sync {
    async fn connect(&mut self) -> Result<()>;
    async fn login(&mut self, user: &str, pass: &str) -> Result<()>;
    async fn get_folders(&mut self) -> Result<Vec<FolderInfo>>;
    async fn select_folder(&mut self, folder: &str) -> Result<()>;
    async fn get_emails(&mut self, folder: &str, limit: usize) -> Result<Vec<EmailSummary>>;
    async fn get_emails_since(&mut self, folder: &str, last_uid: u32) -> Result<Vec<EmailSummary>>;
    async fn get_emails_before(&mut self, folder: &str, before_uid: u32, limit: usize) -> Result<Vec<EmailSummary>>;
    async fn get_email_details(&mut self, folder: &str, uid: &str) -> Result<EmailDetails>;
    async fn get_attachment(
        &mut self,
        folder: &str,
        uid: &str,
        attachment_id: &str,
    ) -> Result<Vec<u8>>;
    async fn set_flag(&mut self, folder: &str, uid: &str, flag: &str, value: bool) -> Result<()>;
    async fn delete_email(&mut self, folder: &str, uid: &str) -> Result<()>;
    async fn idle(&mut self, folder: &str) -> Result<()>;
    async fn append_message(&mut self, folder: &str, content: &[u8]) -> Result<()>;
}

#[async_trait]
pub trait MailSender: Send + Sync {
    async fn send_email(
        &self,
        from: &str,
        to: &str,
        subject: &str,
        body: &str,
        attachments: Vec<String>,
    ) -> Result<Vec<u8>>;
}
