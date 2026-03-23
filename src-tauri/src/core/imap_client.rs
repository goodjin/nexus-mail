use imap;
use native_tls::{TlsConnector, TlsStream};
use anyhow::{Result, Context};
use async_trait::async_trait;
use std::net::TcpStream;
use tokio::sync::Mutex;
use std::sync::Arc;
use mailparse::MailHeaderMap;
use md5;
use super::traits::{MailClient, FolderInfo, EmailSummary, EmailDetails};

pub struct RealImapClient {
    host: String,
    port: u16,
    _username: String,
    inner: Arc<Mutex<ImapState>>,
}

enum ImapState {
    Disconnected,
    ConnectedPlain(imap::Client<TcpStream>),
    ConnectedSsl(imap::Client<TlsStream<TcpStream>>),
    AuthenticatedPlain(imap::Session<TcpStream>),
    AuthenticatedSsl(imap::Session<TlsStream<TcpStream>>),
}

impl RealImapClient {
    pub fn new(host: &str, port: u16, username: &str) -> Self {
        Self {
            host: host.into(),
            port,
            _username: username.into(),
            inner: Arc::new(Mutex::new(ImapState::Disconnected)),
        }
    }
}

#[async_trait]
impl MailClient for RealImapClient {
    async fn connect(&mut self) -> Result<()> {
        let mut state = self.inner.lock().await;
        
        if self.port == 993 {
            let tls = TlsConnector::builder().build().context("Failed to build TLS connector")?;
            let client = imap::connect((self.host.as_str(), self.port), self.host.as_str(), &tls)
                .context("Failed to connect to IMAP server with SSL")?;
            *state = ImapState::ConnectedSsl(client);
        } else {
            let stream = TcpStream::connect((self.host.as_str(), self.port))
                .context("Failed to connect via TCP")?;
            let client = imap::Client::new(stream);
            *state = ImapState::ConnectedPlain(client);
        }
        Ok(())
    }

    async fn login(&mut self, user: &str, pass: &str) -> Result<()> {
        let mut state = self.inner.lock().await;
        let current_state = std::mem::replace(&mut *state, ImapState::Disconnected);

        match current_state {
            ImapState::ConnectedPlain(client) => {
                let session = client.login(user, pass)
                    .map_err(|(e, _)| anyhow::anyhow!("Plain Login failed: {}", e))?;
                *state = ImapState::AuthenticatedPlain(session);
            }
            ImapState::ConnectedSsl(client) => {
                let session = client.login(user, pass)
                    .map_err(|(e, _)| anyhow::anyhow!("SSL Login failed: {}", e))?;
                *state = ImapState::AuthenticatedSsl(session);
            }
            _ => return Err(anyhow::anyhow!("Invalid state for login")),
        }
        
        Ok(())
    }

    async fn get_folders(&mut self) -> Result<Vec<FolderInfo>> {
        let mut state = self.inner.lock().await;
        let folders = match &mut *state {
            ImapState::AuthenticatedPlain(s) => s.list(None, Some("*"))?,
            ImapState::AuthenticatedSsl(s) => s.list(None, Some("*"))?,
            _ => return Err(anyhow::anyhow!("Not authenticated")),
        };

        Ok(folders.iter().map(|f| FolderInfo {
            id: uuid::Uuid::new_v4().to_string(),
            name: f.name().into(),
            remote_id: f.name().into(), // 简化
            unread_count: 0,
        }).collect())
    }

    async fn select_folder(&mut self, folder: &str) -> Result<()> {
        let mut state = self.inner.lock().await;
        match &mut *state {
            ImapState::AuthenticatedPlain(s) => { s.select(folder)?; },
            ImapState::AuthenticatedSsl(s) => { s.select(folder)?; },
            _ => return Err(anyhow::anyhow!("Not authenticated")),
        };
        Ok(())
    }

    async fn get_emails(&mut self, folder: &str, limit: usize) -> Result<Vec<EmailSummary>> {
        self.select_folder(folder).await?;
        let mut state = self.inner.lock().await;

        let summaries = match &mut *state {
            ImapState::AuthenticatedPlain(s) => {
                let total = s.select(folder)?.exists;
                if total == 0 { return Ok(vec![]); }
                let start = if total > limit as u32 { total - limit as u32 + 1 } else { 1 };
                let range = format!("{}:{}", start, total);
                let fetch = s.fetch(&range, "(UID RFC822.HEADER)")?;
                fetch.iter().filter_map(|item| self.parse_fetch_item(item)).collect::<Vec<_>>()
            }
            ImapState::AuthenticatedSsl(s) => {
                let total = s.select(folder)?.exists;
                if total == 0 { return Ok(vec![]); }
                let start = if total > limit as u32 { total - limit as u32 + 1 } else { 1 };
                let range = format!("{}:{}", start, total);
                let fetch = s.fetch(&range, "(UID RFC822.HEADER)")?;
                fetch.iter().filter_map(|item| self.parse_fetch_item(item)).collect::<Vec<_>>()
            }
            _ => return Err(anyhow::anyhow!("Not authenticated")),
        };
        
        let mut summaries = summaries;
        
        // 按 UID 降序排列（最新在前）
        summaries.sort_by(|a, b| b.uid.cmp(&a.uid));
        Ok(summaries)
    }

    async fn get_emails_since(&mut self, folder: &str, last_uid: u32) -> Result<Vec<EmailSummary>> {
        self.select_folder(folder).await?;
        let mut state = self.inner.lock().await;

        let range = format!("{}:*", last_uid + 1);
        println!("[IMAP] UID FETCH {}", range);

        let summaries = match &mut *state {
            ImapState::AuthenticatedPlain(s) => {
                let fetch = s.uid_fetch(&range, "(UID RFC822.HEADER)")?;
                fetch.iter().filter_map(|item| self.parse_fetch_item(item)).collect::<Vec<_>>()
            }
            ImapState::AuthenticatedSsl(s) => {
                let fetch = s.uid_fetch(&range, "(UID RFC822.HEADER)")?;
                fetch.iter().filter_map(|item| self.parse_fetch_item(item)).collect::<Vec<_>>()
            }
            _ => return Err(anyhow::anyhow!("Not authenticated")),
        };
        
        let mut summaries = summaries;
        
        summaries.sort_by(|a, b| b.uid.cmp(&a.uid));
        Ok(summaries)
    }

    async fn get_email_details(&mut self, folder: &str, uid: &str) -> Result<EmailDetails> {
        self.select_folder(folder).await?;
        let mut state = self.inner.lock().await;

        let raw_body = match &mut *state {
            ImapState::AuthenticatedPlain(s) => {
                let fetch = s.uid_fetch(uid, "BODY[]")?;
                fetch.iter().next().and_then(|i| i.body()).ok_or_else(|| anyhow::anyhow!("Body not found"))?.to_vec()
            }
            ImapState::AuthenticatedSsl(s) => {
                let fetch = s.uid_fetch(uid, "BODY[]")?;
                fetch.iter().next().and_then(|i| i.body()).ok_or_else(|| anyhow::anyhow!("Body not found"))?.to_vec()
            }
            _ => return Err(anyhow::anyhow!("Not authenticated")),
        };

        let parsed = mailparse::parse_mail(&raw_body).context("Failed to parse RFC822 body")?;
        
        let mut body_html = None;
        let mut body_text = None;
        let mut attachments = Vec::new();

        // 递归遍历 MIME 树
        fn walk_parts(
            part: &mailparse::ParsedMail, 
            html: &mut Option<String>, 
            text: &mut Option<String>,
            attachments: &mut Vec<super::traits::AttachmentInfo>
        ) {
            let content_type = part.get_headers().get_first_value("Content-Type").unwrap_or_default().to_lowercase();
            let disposition = part.get_headers().get_first_value("Content-Disposition").unwrap_or_default().to_lowercase();
            let filename = part.get_content_disposition().params.get("filename").cloned().unwrap_or_default();

            if disposition.contains("attachment") || !filename.is_empty() {
                let body_raw = part.get_body_raw().unwrap_or_default();
                let id = format!("{:x}", md5::compute(&body_raw));
                attachments.push(super::traits::AttachmentInfo {
                    id,
                    filename: if filename.is_empty() { "unnamed".to_string() } else { filename },
                    mime_type: content_type,
                    size: body_raw.len(),
                });
            } else if content_type.contains("text/html") {
                if html.is_none() {
                    *html = part.get_body().ok();
                }
            } else if content_type.contains("text/plain") {
                if text.is_none() {
                    *text = part.get_body().ok();
                }
            }

            for subpart in &part.subparts {
                walk_parts(subpart, html, text, attachments);
            }
        }

        walk_parts(&parsed, &mut body_html, &mut body_text, &mut attachments);

        Ok(EmailDetails {
            uid: uid.into(),
            body_html,
            body_text,
            attachments,
        })
    }

    async fn get_attachment(&mut self, folder: &str, uid: &str, attachment_id: &str) -> Result<Vec<u8>> {
        self.select_folder(folder).await?;
        let mut state = self.inner.lock().await;

        let raw_body = match &mut *state {
            ImapState::AuthenticatedPlain(s) => {
                let fetch = s.uid_fetch(uid, "BODY[]")?;
                let item = fetch.iter().next().ok_or_else(|| anyhow::anyhow!("Email not found"))?;
                item.body().ok_or_else(|| anyhow::anyhow!("Empty body"))?.to_vec()
            }
            ImapState::AuthenticatedSsl(s) => {
                let fetch = s.uid_fetch(uid, "BODY[]")?;
                let item = fetch.iter().next().ok_or_else(|| anyhow::anyhow!("Email not found"))?;
                item.body().ok_or_else(|| anyhow::anyhow!("Empty body"))?.to_vec()
            }
            _ => return Err(anyhow::anyhow!("Not connected")),
        };

        let parsed = mailparse::parse_mail(&raw_body)?;
        
        self.find_attachment_recursive(&parsed, attachment_id)
            .ok_or_else(|| anyhow::anyhow!("Attachment not found"))
    }

    async fn set_flag(&mut self, folder: &str, uid: &str, flag: &str, value: bool) -> Result<()> {
        self.select_folder(folder).await?;
        let mut state = self.inner.lock().await;
        let action = if value { "+FLAGS" } else { "-FLAGS" };
        match &mut *state {
            ImapState::AuthenticatedPlain(s) => { s.uid_store(uid, format!("{} ({})", action, flag))?; }
            ImapState::AuthenticatedSsl(s) => { s.uid_store(uid, format!("{} ({})", action, flag))?; }
            _ => return Err(anyhow::anyhow!("Not connected")),
        }
        Ok(())
    }

    async fn delete_email(&mut self, folder: &str, uid: &str) -> Result<()> {
        self.set_flag(folder, uid, "\\Deleted", true).await?;
        let mut state = self.inner.lock().await;
        match &mut *state {
            ImapState::AuthenticatedPlain(s) => { s.expunge()?; }
            ImapState::AuthenticatedSsl(s) => { s.expunge()?; }
            _ => return Err(anyhow::anyhow!("Not connected")),
        }
        Ok(())
    }
}

impl RealImapClient {
    fn find_attachment_recursive(&self, part: &mailparse::ParsedMail, target_id: &str) -> Option<Vec<u8>> {
        let body_raw = part.get_body_raw().unwrap_or_default();
        let current_id = format!("{:x}", md5::compute(&body_raw));

        if current_id == target_id {
            return Some(body_raw.to_vec());
        }

        for subpart in &part.subparts {
            if let Some(data) = self.find_attachment_recursive(subpart, target_id) {
                return Some(data);
            }
        }
        None
    }
}

impl RealImapClient {
    fn parse_fetch_item(&self, item: &imap::types::Fetch) -> Option<EmailSummary> {
        let uid = item.uid?.to_string();
        let header_bytes = item.header()?;
        
        let (headers, _) = mailparse::parse_headers(header_bytes).ok()?;
        
        let mut subject = String::from("(No Subject)");
        let mut from = String::from("(Unknown Sender)");
        let mut date = String::new();
        
        for header in headers {
            match header.get_key().to_lowercase().as_str() {
                "subject" => subject = header.get_value(),
                "from" => from = header.get_value(),
                "date" => date = header.get_value(),
                _ => {}
            }
        }
        
        Some(EmailSummary {
            uid,
            subject,
            from,
            date,
            snippet: String::from("..."), // 暂时不抓取正文摘要
        })
    }
}
