use imap;
use native_tls::{TlsConnector, TlsStream};
use anyhow::{Result, Context};
use async_trait::async_trait;
use std::net::TcpStream;
use tokio::sync::Mutex;
use std::sync::Arc;
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

    async fn get_email_details(&mut self, _folder: &str, _uid: &str) -> Result<EmailDetails> {
        Err(anyhow::anyhow!("Not implemented yet"))
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
