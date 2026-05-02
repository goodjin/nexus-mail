use super::traits::{EmailDetails, EmailHeader, EmailSummary, FolderInfo, MailClient};
use anyhow::Result;
use async_trait::async_trait;
use imap;
use mailparse;
use native_tls::TlsStream;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct RealImapClient {
    host: String,
    port: u16,
    username: String,
    use_tls: bool,
    pool: Arc<Mutex<ConnectionPool>>,
}

struct ConnectionPool {
    sessions: Vec<ImapState>,
    max_size: usize,
    password: Option<String>,
}

impl ConnectionPool {
    fn new(max_size: usize) -> Self {
        Self {
            sessions: Vec::new(),
            max_size,
            password: None,
        }
    }
}

enum ImapState {
    AuthenticatedPlain(imap::Session<TcpStream>),
    AuthenticatedSsl(imap::Session<TlsStream<TcpStream>>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MoveCommandStrategy {
    UidMove,
    CopyThenUidExpunge,
    CopyThenScopedExpunge,
}

fn select_move_strategy(has_move: bool, has_uidplus: bool) -> MoveCommandStrategy {
    if has_move {
        MoveCommandStrategy::UidMove
    } else if has_uidplus {
        MoveCommandStrategy::CopyThenUidExpunge
    } else {
        MoveCommandStrategy::CopyThenScopedExpunge
    }
}

fn deleted_uids_to_restore(
    deleted_uids: &std::collections::HashSet<imap::types::Uid>,
    target_uid: imap::types::Uid,
) -> Vec<String> {
    let mut restore_uids: Vec<_> = deleted_uids
        .iter()
        .copied()
        .filter(|candidate| *candidate != target_uid)
        .collect();
    restore_uids.sort_unstable();
    restore_uids
        .into_iter()
        .map(|value| value.to_string())
        .collect()
}

impl RealImapClient {
    pub fn new(host: &str, port: u16, username: &str, use_tls: bool) -> Self {
        Self {
            host: host.to_string(),
            port,
            username: username.to_string(),
            use_tls,
            pool: Arc::new(Mutex::new(ConnectionPool::new(5))),
        }
    }

    pub async fn test_connectivity(&self) -> Result<()> {
        if self.use_tls {
            let tls = native_tls::TlsConnector::builder().build()?;
            let _ = imap::connect((self.host.as_str(), self.port), self.host.as_str(), &tls)?;
        } else {
            let _ = std::net::TcpStream::connect((self.host.as_str(), self.port))?;
        }
        Ok(())
    }

    async fn get_session(&self) -> Result<ImapState> {
        let mut pool = self.pool.lock().await;
        if let Some(session) = pool.sessions.pop() {
            return Ok(session);
        }

        // 如果池为空且已有密码，创建新连接
        let password = pool.password.clone();
        if let Some(pass) = password {
            drop(pool); // 释放锁以防递归或长时间占用
            let client = self
                .create_authenticated_session(&self.username, &pass)
                .await?;
            return Ok(client);
        }

        Err(anyhow::anyhow!(
            "No authenticated session available and no password stored"
        ))
    }

    async fn return_session(&self, session: ImapState) {
        let mut pool = self.pool.lock().await;
        if pool.sessions.len() < pool.max_size {
            pool.sessions.push(session);
        }
        // 否则 session 超出限制会被丢弃并自动关闭
    }

    async fn create_authenticated_session(&self, user: &str, pass: &str) -> Result<ImapState> {
        if self.use_tls {
            let tls = native_tls::TlsConnector::builder().build()?;
            let client = imap::connect((self.host.as_str(), self.port), self.host.as_str(), &tls)?;
            let session = client
                .login(user, pass)
                .map_err(|(e, _)| anyhow::anyhow!("Login failed: {}", e))?;
            Ok(ImapState::AuthenticatedSsl(session))
        } else {
            let stream = std::net::TcpStream::connect((self.host.as_str(), self.port))?;
            let client = imap::Client::new(stream);
            let session = client
                .login(user, pass)
                .map_err(|(e, _)| anyhow::anyhow!("Login failed: {}", e))?;
            Ok(ImapState::AuthenticatedPlain(session))
        }
    }

    fn expunge_only_selected_uid<T: Read + Write>(
        session: &mut imap::Session<T>,
        uid: &str,
        has_uidplus: bool,
    ) -> Result<()> {
        if has_uidplus {
            session.uid_store(uid, "+FLAGS.SILENT (\\Deleted)")?;
            session.uid_expunge(uid)?;
            return Ok(());
        }

        let target_uid = uid.parse::<imap::types::Uid>()?;
        let deleted_uids = session.uid_search("DELETED")?;
        let restore_set = deleted_uids_to_restore(&deleted_uids, target_uid).join(",");

        if !restore_set.is_empty() {
            session.uid_store(&restore_set, "-FLAGS.SILENT (\\Deleted)")?;
        }

        let expunge_result = (|| -> Result<()> {
            session.uid_store(uid, "+FLAGS.SILENT (\\Deleted)")?;
            session.expunge()?;
            Ok(())
        })();

        if !restore_set.is_empty() {
            session.uid_store(&restore_set, "+FLAGS.SILENT (\\Deleted)")?;
        }

        expunge_result
    }

    fn move_selected_uid<T: Read + Write>(
        session: &mut imap::Session<T>,
        uid: &str,
        target_folder: &str,
    ) -> Result<()> {
        let capabilities = session.capabilities()?;
        let strategy = select_move_strategy(
            capabilities.has_str("MOVE"),
            capabilities.has_str("UIDPLUS"),
        );

        match strategy {
            MoveCommandStrategy::UidMove => session.uid_mv(uid, target_folder)?,
            MoveCommandStrategy::CopyThenUidExpunge => {
                session.uid_copy(uid, target_folder)?;
                Self::expunge_only_selected_uid(session, uid, true)?;
            }
            MoveCommandStrategy::CopyThenScopedExpunge => {
                session.uid_copy(uid, target_folder)?;
                Self::expunge_only_selected_uid(session, uid, false)?;
            }
        }

        Ok(())
    }
}

#[async_trait]
impl MailClient for RealImapClient {
    async fn connect(&mut self) -> Result<()> {
        self.test_connectivity().await
    }

    async fn login(&mut self, user: &str, pass: &str) -> Result<()> {
        let mut pool = self.pool.lock().await;
        pool.password = Some(pass.to_string());

        // 创建初始连接以验证凭据
        drop(pool);
        let session = self.create_authenticated_session(user, pass).await?;
        self.return_session(session).await;
        Ok(())
    }

    async fn get_folders(&mut self) -> Result<Vec<FolderInfo>> {
        let mut state = self.get_session().await?;
        let folders = match &mut state {
            ImapState::AuthenticatedPlain(s) => s.list(None, Some("*"))?,
            ImapState::AuthenticatedSsl(s) => s.list(None, Some("*"))?,
        };

        self.return_session(state).await;
        let mut folder_infos = Vec::new();
        let mut seen_system_ids = std::collections::HashSet::new();

        for f in &folders {
            let raw_name = f.name().to_string();
            let decoded_name = utf7_imap::decode_utf7_imap(raw_name.clone());
            let name_upper = decoded_name.to_uppercase();

            let mut system_role = None;

            // 1. Attribute matching (RFC 6154 SPECIAL-USE)
            for attr in f.attributes() {
                let attr_str = format!("{:?}", attr).to_uppercase();
                if attr_str.contains("SENT") {
                    system_role = Some("SENT".to_string());
                } else if attr_str.contains("DRAFTS") {
                    system_role = Some("DRAFTS".to_string());
                } else if attr_str.contains("TRASH") {
                    system_role = Some("TRASH".to_string());
                } else if attr_str.contains("JUNK") || attr_str.contains("SPAM") {
                    system_role = Some("SPAM".to_string());
                } else if attr_str.contains("ARCHIVE") {
                    system_role = Some("ARCHIVE".to_string());
                }
            }

            // 2. Name matching fallback
            if system_role.is_none() {
                if name_upper == "INBOX" || name_upper.contains("收件箱") {
                    system_role = Some("INBOX".to_string());
                } else if name_upper.contains("SENT")
                    || name_upper.contains("已发送")
                    || name_upper.contains("发送内容")
                {
                    system_role = Some("SENT".to_string());
                } else if name_upper.contains("DRAFTS")
                    || name_upper.contains("DRAFT")
                    || name_upper.contains("草稿")
                {
                    system_role = Some("DRAFTS".to_string());
                } else if name_upper.contains("TRASH")
                    || name_upper.contains("DELETED")
                    || name_upper.contains("BIN")
                    || name_upper.contains("已删除")
                    || name_upper.contains("垃圾箱")
                {
                    system_role = Some("TRASH".to_string());
                } else if name_upper.contains("SPAM")
                    || name_upper.contains("JUNK")
                    || name_upper.contains("垃圾邮件")
                    || name_upper.contains("垃圾")
                {
                    system_role = Some("SPAM".to_string());
                } else if name_upper.contains("ARCHIVE")
                    || name_upper.contains("ALL MAIL")
                    || name_upper.contains("ALLMAIL")
                    || name_upper.contains("归档")
                    || name_upper.contains("所有邮件")
                {
                    system_role = Some("ARCHIVE".to_string());
                }
            }

            // Standardize INBOX id
            if name_upper == "INBOX" {
                system_role = Some("INBOX".to_string());
            }

            // Deduplication & Skipping
            if let Some(ref role) = system_role {
                if seen_system_ids.contains(role) {
                    // Skip this folder entirely if we already have a folder for this system role
                    continue;
                } else {
                    seen_system_ids.insert(role.clone());
                }
            }

            folder_infos.push(FolderInfo {
                id: uuid::Uuid::new_v4().to_string(),
                name: decoded_name,
                remote_id: raw_name,
                unread_count: 0,
                system_role,
            });
        }
        let mut folder_infos = folder_infos;
        let role_rank = |role: &Option<String>| match role.as_deref() {
            Some("INBOX") => 0,
            Some("SENT") => 1,
            Some("DRAFTS") => 2,
            Some("SPAM") => 3,
            Some("TRASH") => 4,
            Some("ARCHIVE") => 5,
            _ => 6,
        };
        folder_infos.sort_by(|a, b| {
            role_rank(&a.system_role)
                .cmp(&role_rank(&b.system_role))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(folder_infos)
    }

    async fn select_folder(&mut self, folder: &str) -> Result<()> {
        // 在池化模式中，select_folder 通常作为具体操作的前置步骤，而不是独立操作。
        // 为了维持 trait 兼容性，我们确保某个 session 选中该文件夹。
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.select(folder)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.select(folder)?;
            }
        }
        self.return_session(state).await;
        Ok(())
    }

    async fn get_emails(&mut self, folder: &str, limit: usize) -> Result<Vec<EmailSummary>> {
        let mut state = self.get_session().await?;

        let summaries = match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                let total = s.select(folder)?.exists;
                if total == 0 {
                    return Ok(vec![]);
                }
                let start = if total > limit as u32 {
                    total - limit as u32 + 1
                } else {
                    1
                };
                let range = format!("{}:{}", start, total);
                let fetch = s.fetch(&range, "(UID FLAGS RFC822.HEADER)")?;
                fetch
                    .iter()
                    .filter_map(|item| self.parse_fetch_item(item))
                    .collect::<Vec<_>>()
            }
            ImapState::AuthenticatedSsl(s) => {
                let total = s.select(folder)?.exists;
                if total == 0 {
                    return Ok(vec![]);
                }
                let start = if total > limit as u32 {
                    total - limit as u32 + 1
                } else {
                    1
                };
                let range = format!("{}:{}", start, total);
                let fetch = s.fetch(&range, "(UID FLAGS RFC822.HEADER)")?;
                fetch
                    .iter()
                    .filter_map(|item| self.parse_fetch_item(item))
                    .collect::<Vec<_>>()
            }
        };

        self.return_session(state).await;
        let mut summaries = summaries;
        summaries.sort_by(|a, b| b.uid.cmp(&a.uid));
        Ok(summaries)
    }

    async fn get_emails_since(&mut self, folder: &str, last_uid: u32) -> Result<Vec<EmailSummary>> {
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.select(folder)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.select(folder)?;
            }
        }

        let range = format!("{}:*", last_uid + 1);
        let summaries = match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                let fetch = s.uid_fetch(&range, "(UID FLAGS RFC822.HEADER)")?;
                fetch
                    .iter()
                    .filter_map(|item| self.parse_fetch_item(item))
                    .collect::<Vec<_>>()
            }
            ImapState::AuthenticatedSsl(s) => {
                let fetch = s.uid_fetch(&range, "(UID FLAGS RFC822.HEADER)")?;
                fetch
                    .iter()
                    .filter_map(|item| self.parse_fetch_item(item))
                    .collect::<Vec<_>>()
            }
        };

        self.return_session(state).await;
        let mut summaries = summaries;
        summaries.sort_by(|a, b| b.uid.cmp(&a.uid));
        Ok(summaries)
    }

    async fn get_emails_before(
        &mut self,
        folder: &str,
        before_uid: u32,
        limit: usize,
    ) -> Result<Vec<EmailSummary>> {
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.select(folder)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.select(folder)?;
            }
        }

        let max_uid = if before_uid > 1 {
            before_uid - 1
        } else {
            return Ok(vec![]);
        };
        let search_query = format!("UID 1:{}", max_uid);

        let summaries = match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                let uids_set = s.uid_search(&search_query)?;
                let mut uids: Vec<_> = uids_set.into_iter().collect();
                uids.sort_by(|a, b| b.cmp(a)); // Newest first
                let uids_to_fetch: Vec<_> = uids.into_iter().take(limit).collect();
                if uids_to_fetch.is_empty() {
                    return Ok(vec![]);
                }
                let fetch_query = uids_to_fetch
                    .iter()
                    .map(|id| id.to_string())
                    .collect::<Vec<_>>()
                    .join(",");
                let fetches = s.uid_fetch(&fetch_query, "(UID FLAGS RFC822.HEADER)")?;
                fetches
                    .iter()
                    .filter_map(|item| self.parse_fetch_item(item))
                    .collect::<Vec<_>>()
            }
            ImapState::AuthenticatedSsl(s) => {
                let uids_set = s.uid_search(&search_query)?;
                let mut uids: Vec<_> = uids_set.into_iter().collect();
                uids.sort_by(|a, b| b.cmp(a));
                let uids_to_fetch: Vec<_> = uids.into_iter().take(limit).collect();
                if uids_to_fetch.is_empty() {
                    return Ok(vec![]);
                }
                let fetch_query = uids_to_fetch
                    .iter()
                    .map(|id| id.to_string())
                    .collect::<Vec<_>>()
                    .join(",");
                let fetches = s.uid_fetch(&fetch_query, "(UID FLAGS RFC822.HEADER)")?;
                fetches
                    .iter()
                    .filter_map(|item| self.parse_fetch_item(item))
                    .collect::<Vec<_>>()
            }
        };

        self.return_session(state).await;
        let mut summaries = summaries;
        summaries.sort_by(|a, b| b.uid.cmp(&a.uid));
        Ok(summaries)
    }

    async fn get_email_details(&mut self, folder: &str, uid: &str) -> Result<EmailDetails> {
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.select(folder)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.select(folder)?;
            }
        }

        let fetch_res = match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.uid_fetch(uid, "(UID BODYSTRUCTURE BODY.PEEK[HEADER])")?
            }
            ImapState::AuthenticatedSsl(s) => {
                s.uid_fetch(uid, "(UID BODYSTRUCTURE BODY.PEEK[HEADER])")?
            }
        };

        let item = fetch_res
            .iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("Email not found"))?;
        let structure = item
            .bodystructure()
            .ok_or_else(|| anyhow::anyhow!("No bodystructure"))?;
        let headers = item
            .header()
            .and_then(|bytes| mailparse::parse_headers(bytes).ok())
            .map(|(headers, _)| {
                headers
                    .into_iter()
                    .map(|header| EmailHeader {
                        name: header.get_key().to_string(),
                        value: header.get_value(),
                    })
                    .collect()
            })
            .unwrap_or_default();

        let mut body_html = None;
        let mut body_text = None;
        let mut attachments = Vec::new();

        let mut text_parts = Vec::new();
        Self::parse_structure(structure, "".to_string(), &mut attachments, &mut text_parts);

        // 按需拉取正文部分
        for (path, mime, charset, encoding) in text_parts {
            let fetch_path = if path.is_empty() {
                "TEXT"
            } else {
                path.as_str()
            };
            let part_data = match &mut state {
                ImapState::AuthenticatedPlain(s) => {
                    s.uid_fetch(uid, format!("BODY.PEEK[{}]", fetch_path))?
                }
                ImapState::AuthenticatedSsl(s) => {
                    s.uid_fetch(uid, format!("BODY.PEEK[{}]", fetch_path))?
                }
            };
            let section = Self::build_section_path(&path);
            if let Some(p) = part_data.iter().next().and_then(|i| i.section(&section)) {
                // Construct a fake MIME email string to reuse mailparse's robust decoding and charset converting logic!
                // Notice we ensure the transfer encoding and charset are set so mailparse decodes base64/qp AND gb2312/utf8 correctly!
                let mock_headers = format!(
                    "Content-Type: {}; charset=\"{}\"\r\nContent-Transfer-Encoding: {}\r\n\r\n",
                    mime, charset, encoding
                );

                let mut fake_email = mock_headers.into_bytes();
                fake_email.extend_from_slice(p);

                let decoded_content = if let Ok(parsed) = mailparse::parse_mail(&fake_email) {
                    parsed
                        .get_body()
                        .unwrap_or_else(|_| String::from_utf8_lossy(p).to_string())
                } else {
                    String::from_utf8_lossy(p).to_string()
                };

                if mime == "text/html" && body_html.is_none() {
                    body_html = Some(decoded_content);
                } else if mime == "text/plain" && body_text.is_none() {
                    body_text = Some(decoded_content);
                }
            }
        }

        self.return_session(state).await;
        Ok(EmailDetails {
            uid: uid.into(),
            body_html,
            body_text,
            attachments,
            headers,
        })
    }

    async fn get_attachment(
        &mut self,
        folder: &str,
        uid: &str,
        attachment_id: &str,
    ) -> Result<Vec<u8>> {
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.select(folder)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.select(folder)?;
            }
        }

        let fetch_res = match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.uid_fetch(uid, format!("BODY.PEEK[{}]", attachment_id))?
            }
            ImapState::AuthenticatedSsl(s) => {
                s.uid_fetch(uid, format!("BODY.PEEK[{}]", attachment_id))?
            }
        };

        let item = fetch_res
            .iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("Email not found"))?;
        let section = Self::build_section_path(attachment_id);
        let data = item
            .section(&section)
            .ok_or_else(|| anyhow::anyhow!("Attachment part not found"))?;

        let result = data.to_vec();
        self.return_session(state).await;
        Ok(result)
    }

    async fn create_folder(&mut self, name: &str) -> Result<()> {
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.create(name)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.create(name)?;
            }
        }
        self.return_session(state).await;
        Ok(())
    }

    async fn rename_folder(&mut self, old_name: &str, new_name: &str) -> Result<()> {
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.rename(old_name, new_name)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.rename(old_name, new_name)?;
            }
        }
        self.return_session(state).await;
        Ok(())
    }

    async fn delete_folder(&mut self, name: &str) -> Result<()> {
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.delete(name)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.delete(name)?;
            }
        }
        self.return_session(state).await;
        Ok(())
    }

    async fn set_flag(&mut self, folder: &str, uid: &str, flag: &str, value: bool) -> Result<()> {
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.select(folder)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.select(folder)?;
            }
        }

        let action = if value { "+FLAGS" } else { "-FLAGS" };
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.uid_store(uid, format!("{} ({})", action, flag))?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.uid_store(uid, format!("{} ({})", action, flag))?;
            }
        }
        self.return_session(state).await;
        Ok(())
    }

    async fn delete_email(&mut self, folder: &str, uid: &str) -> Result<()> {
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.select(folder)?;
                let has_uidplus = {
                    let capabilities = s.capabilities()?;
                    capabilities.has_str("UIDPLUS")
                };
                Self::expunge_only_selected_uid(s, uid, has_uidplus)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.select(folder)?;
                let has_uidplus = {
                    let capabilities = s.capabilities()?;
                    capabilities.has_str("UIDPLUS")
                };
                Self::expunge_only_selected_uid(s, uid, has_uidplus)?;
            }
        }
        self.return_session(state).await;
        Ok(())
    }

    async fn move_email(&mut self, folder: &str, uid: &str, target_folder: &str) -> Result<()> {
        let mut state = self.get_session().await?;
        match &mut state {
            ImapState::AuthenticatedPlain(s) => {
                s.select(folder)?;
                Self::move_selected_uid(s, uid, target_folder)?;
            }
            ImapState::AuthenticatedSsl(s) => {
                s.select(folder)?;
                Self::move_selected_uid(s, uid, target_folder)?;
            }
        }
        self.return_session(state).await;
        Ok(())
    }

    async fn idle(&mut self, folder: &str) -> Result<()> {
        let mut session = self.get_session().await?;
        match session {
            ImapState::AuthenticatedPlain(ref mut s) => {
                s.select(folder)?;
                let h = s.idle()?;
                h.wait_keepalive()?;
            }
            ImapState::AuthenticatedSsl(ref mut s) => {
                s.select(folder)?;
                let h = s.idle()?;
                h.wait_keepalive()?;
            }
        }
        self.return_session(session).await;
        Ok(())
    }

    async fn append_message(&mut self, folder: &str, content: &[u8]) -> Result<()> {
        let mut session = self.get_session().await?;
        match session {
            ImapState::AuthenticatedPlain(ref mut s) => {
                s.append(folder, content)?;
            }
            ImapState::AuthenticatedSsl(ref mut s) => {
                s.append(folder, content)?;
            }
        }
        self.return_session(session).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    #[tokio::test]
    async fn test_imap_connectivity_fails_on_tls_mismatch() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 8];
                let _ = stream.read(&mut buf);
            }
        });

        let client = RealImapClient::new("127.0.0.1", port, "demo@nexus-mail.com", true);
        assert!(client.test_connectivity().await.is_err());
    }

    #[test]
    fn move_strategy_prefers_uid_move_when_supported() {
        assert_eq!(
            select_move_strategy(true, true),
            MoveCommandStrategy::UidMove
        );
        assert_eq!(
            select_move_strategy(true, false),
            MoveCommandStrategy::UidMove
        );
    }

    #[test]
    fn move_strategy_falls_back_to_uid_expunge_before_scoped_expunge() {
        assert_eq!(
            select_move_strategy(false, true),
            MoveCommandStrategy::CopyThenUidExpunge
        );
        assert_eq!(
            select_move_strategy(false, false),
            MoveCommandStrategy::CopyThenScopedExpunge
        );
    }

    #[test]
    fn deleted_uid_restore_set_excludes_target_uid() {
        let deleted_uids = std::collections::HashSet::from([42, 7, 99]);

        assert_eq!(
            deleted_uids_to_restore(&deleted_uids, 42),
            vec!["7".to_string(), "99".to_string()]
        );
    }
}

impl RealImapClient {
    fn parse_structure(
        bs: &imap_proto::types::BodyStructure<'_>,
        path: String,
        attachments: &mut Vec<super::traits::AttachmentInfo>,
        text_parts: &mut Vec<(String, String, String, String)>,
    ) {
        match bs {
            imap_proto::types::BodyStructure::Basic { common, other, .. } => {
                Self::process_single_part(common, other, path, attachments, text_parts);
            }
            imap_proto::types::BodyStructure::Text { common, other, .. } => {
                Self::process_single_part(common, other, path, attachments, text_parts);
            }
            imap_proto::types::BodyStructure::Message { common, other, .. } => {
                Self::process_single_part(common, other, path, attachments, text_parts);
            }
            imap_proto::types::BodyStructure::Multipart { bodies, .. } => {
                for (i, part) in bodies.iter().enumerate() {
                    let idx = (i + 1) as u32;
                    let sub_path = if path.is_empty() {
                        idx.to_string()
                    } else {
                        format!("{}.{}", path, idx)
                    };
                    Self::parse_structure(part, sub_path, attachments, text_parts);
                }
            }
        }
    }

    fn process_single_part(
        common: &imap_proto::types::BodyContentCommon<'_>,
        other: &imap_proto::types::BodyContentSinglePart<'_>,
        path: String,
        attachments: &mut Vec<super::traits::AttachmentInfo>,
        text_parts: &mut Vec<(String, String, String, String)>,
    ) {
        let mime = format!("{}/{}", common.ty.ty, common.ty.subtype).to_lowercase();
        let disposition_ty = common
            .disposition
            .as_ref()
            .map(|d| d.ty.to_lowercase())
            .unwrap_or_default();
        let content_id = other.id.map(|id| id.to_string());
        let is_inline = disposition_ty.contains("inline");

        let filename = common
            .disposition
            .as_ref()
            .and_then(|d| {
                d.params.as_ref().and_then(|p| {
                    p.iter()
                        .find(|(k, _)| k.to_lowercase() == "filename")
                        .map(|(_, v)| v)
                })
            })
            .cloned()
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                common
                    .ty
                    .params
                    .as_ref()
                    .and_then(|p| {
                        p.iter()
                            .find(|pair| pair.0.to_lowercase() == "name")
                            .map(|pair| pair.1.to_string())
                    })
                    .unwrap_or_default()
            });

        if disposition_ty.contains("attachment")
            || is_inline
            || !filename.is_empty()
            || content_id.is_some()
        {
            attachments.push(super::traits::AttachmentInfo {
                id: path.clone(),
                filename,
                mime_type: mime,
                size: other.octets as usize,
                content_id,
                is_inline,
            });
        } else if mime == "text/plain" || mime == "text/html" {
            let charset = common
                .ty
                .params
                .as_ref()
                .and_then(|p| {
                    p.iter()
                        .find(|pair| pair.0.to_lowercase() == "charset")
                        .map(|pair| pair.1.to_string())
                })
                .unwrap_or_else(|| "utf-8".to_string());

            // Actually `imap_proto::types::BodyContentSinglePart` has `transfer_encoding: ContentEncoding<'a>`.
            let encoding = match other.transfer_encoding {
                imap_proto::types::ContentEncoding::SevenBit => "7bit",
                imap_proto::types::ContentEncoding::EightBit => "8bit",
                imap_proto::types::ContentEncoding::Binary => "binary",
                imap_proto::types::ContentEncoding::Base64 => "base64",
                imap_proto::types::ContentEncoding::QuotedPrintable => "quoted-printable",
                imap_proto::types::ContentEncoding::Other(s) => s,
            }
            .to_string();

            text_parts.push((path, mime, charset, encoding));
        }
    }

    fn build_section_path(path_str: &str) -> imap_proto::types::SectionPath {
        let parts: Vec<u32> = path_str.split('.').filter_map(|s| s.parse().ok()).collect();
        if parts.is_empty() {
            imap_proto::types::SectionPath::Full(imap_proto::types::MessageSection::Text)
        } else {
            imap_proto::types::SectionPath::Part(parts, None)
        }
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
        let mut message_id = None;

        for header in headers {
            match header.get_key().to_lowercase().as_str() {
                "subject" => subject = header.get_value(),
                "from" => from = header.get_value(),
                "date" => date = header.get_value(),
                "message-id" => {
                    let val = header
                        .get_value()
                        .trim_matches(|c| c == '<' || c == '>')
                        .to_string();
                    message_id = Some(format!("<{}>", val)); // Keep angle brackets standardized locally
                }
                _ => {}
            }
        }

        let flags: Vec<String> = item
            .flags()
            .iter()
            .map(|f| format!("{:?}", f)) // Convert imap::types::Flag to String
            .collect();

        Some(EmailSummary {
            uid,
            subject,
            from,
            date,
            snippet: String::from("..."),
            flags,
            message_id,
        })
    }
}
