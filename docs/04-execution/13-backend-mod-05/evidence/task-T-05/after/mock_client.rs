use super::traits::{EmailDetails, EmailSummary, FolderInfo, MailClient, MailSender, SendEmailRequest, SendEmailResult};
use anyhow::Result;
use async_trait::async_trait;

pub struct MockMailClient {
    pub is_connected: bool,
}

impl MockMailClient {
    pub fn new() -> Self {
        Self {
            is_connected: false,
        }
    }
}

#[async_trait]
impl MailClient for MockMailClient {
    async fn connect(&mut self) -> Result<()> {
        self.is_connected = true;
        println!("[Mock] IMAP Connecting...");
        Ok(())
    }

    async fn login(&mut self, user: &str, _pass: &str) -> Result<()> {
        if !self.is_connected {
            return Err(anyhow::anyhow!("Not connected"));
        }
        println!("[Mock] IMAP Logged in as {}", user);
        Ok(())
    }

    async fn get_folders(&mut self) -> Result<Vec<FolderInfo>> {
        let folders = vec![
            FolderInfo {
                id: "mock-inbox".into(),
                name: "收件箱".into(),
                remote_id: "INBOX".into(),
                unread_count: 128,
                system_role: Some("INBOX".into()),
            },
            FolderInfo {
                id: "mock-flagged".into(),
                name: "重要邮件".into(),
                remote_id: "FLAGGED".into(),
                unread_count: 999,
                system_role: None,
            },
            FolderInfo {
                id: "mock-drafts".into(),
                name: "草稿箱".into(),
                remote_id: "Drafts".into(),
                unread_count: 2,
                system_role: Some("DRAFTS".into()),
            },
            FolderInfo {
                id: "mock-sent".into(),
                name: "已发送".into(),
                remote_id: "Sent".into(),
                unread_count: 0,
                system_role: Some("SENT".into()),
            },
            FolderInfo {
                id: "mock-junk".into(),
                name: "垃圾邮件".into(),
                remote_id: "Junk".into(),
                unread_count: 42,
                system_role: Some("SPAM".into()),
            },
            FolderInfo {
                id: "mock-nexus".into(),
                name: "工作/项目/Nexus".into(),
                remote_id: "Work/Nexus".into(),
                unread_count: 0,
                system_role: None,
            },
        ];
        Ok(folders)
    }

    async fn select_folder(&mut self, folder: &str) -> Result<()> {
        println!("[Mock] Selecting folder: {}", folder);
        Ok(())
    }

    async fn get_emails(&mut self, folder: &str, limit: usize) -> Result<Vec<EmailSummary>> {
        println!("[Mock] Fetching up to {} emails from {}...", limit, folder);

        let mut emails = Vec::new();
        emails.push(EmailSummary {
            uid: "1001".into(),
            subject: "【重要】Nexus Mail 项目进度同步".into(),
            from: "jin@elysys.net".into(),
            date: "2026-03-20 09:15".into(),
            snippet: "关于下周的发布计划，我们需要确认以下几个核心模块的验收...".into(),
            flags: vec![],
            message_id: None,
        });

        emails.push(EmailSummary {
            uid: "1002".into(),
            subject: "Re: 您的订阅已更新".into(),
            from: "billing@service.com".into(),
            date: "2026-03-19 22:10".into(),
            snippet: "感谢您订阅我们的高级计划。您的下一份账单将在 4 月 19 日生成...".into(),
            flags: vec!["\\Seen".to_string()],
            message_id: None,
        });

        Ok(emails)
    }

    async fn get_emails_since(
        &mut self,
        _folder: &str,
        last_uid: u32,
    ) -> Result<Vec<EmailSummary>> {
        println!("[Mock] Incremental fetch since UID {}", last_uid);
        Ok(vec![EmailSummary {
            uid: (last_uid + 1).to_string(),
            subject: "新到来的增量邮件".into(),
            from: "new@example.com".into(),
            date: "2026-03-20 16:30".into(),
            snippet: "这是模拟增量同步后新抓取到的邮件体验。".into(),
            flags: vec![],
            message_id: None,
        }])
    }

    async fn get_emails_before(
        &mut self,
        _folder: &str,
        before_uid: u32,
        limit: usize,
    ) -> Result<Vec<EmailSummary>> {
        println!("[Mock] History fetch before UID {}, limit {}", before_uid, limit);
        let mut emails = Vec::new();
        for i in 1..=limit {
            let uid = before_uid.saturating_sub(i as u32);
            if uid == 0 { break; }
            emails.push(EmailSummary {
                uid: uid.to_string(),
                subject: format!("历史邮件 #{}", uid),
                from: "old@example.com".into(),
                date: "2025-12-01".into(),
                snippet: "这是较早之前的历史邮件模拟。".into(),
                flags: vec!["\\Seen".to_string()],
                message_id: None,
            });
        }
        Ok(emails)
    }

    async fn get_email_details(&mut self, _folder: &str, uid: &str) -> Result<EmailDetails> {
        Ok(EmailDetails {
            uid: uid.into(),
            body_html: Some(format!("<html><body><h1>内容预览</h1><p>UID: {}</p><p>这是一个带有模拟附件的邮件。</p></body></html>", uid)),
            body_text: Some(format!("UID: {}", uid)),
            attachments: vec![super::traits::AttachmentInfo {
                id: "1.2".to_string(),
                filename: "welcome.pdf".to_string(),
                mime_type: "application/pdf".to_string(),
                size: 1024 * 1024,
                content_id: None,
                is_inline: false,
            }],
            headers: vec![
                super::traits::EmailHeader {
                    name: "From".to_string(),
                    value: "mock@example.com".to_string(),
                },
                super::traits::EmailHeader {
                    name: "Subject".to_string(),
                    value: "Mock Detail".to_string(),
                },
            ],
        })
    }

    async fn get_attachment(
        &mut self,
        _folder: &str,
        _uid: &str,
        attachment_id: &str,
    ) -> Result<Vec<u8>> {
        if attachment_id == "mock-att-1" {
            return Ok("Mock PDF Content: Application Guide".as_bytes().to_vec());
        }
        Ok(vec![0; 100])
    }

    async fn set_flag(
        &mut self,
        _folder: &str,
        _uid: &str,
        _flag: &str,
        _value: bool,
    ) -> Result<()> {
        println!("[Mock] Setting flag {} to {}", _flag, _value);
        Ok(())
    }

    async fn delete_email(&mut self, _folder: &str, _uid: &str) -> Result<()> {
        Ok(())
    }

    async fn move_email(&mut self, _folder: &str, _uid: &str, _target_folder: &str) -> Result<()> {
        println!("[Mock] Moving email {} from {} to {}", _uid, _folder, _target_folder);
        Ok(())
    }

    async fn idle(&mut self, _folder: &str) -> Result<()> {
        println!("[Mock] Entering IDLE for {}", _folder);
        Ok(())
    }

    async fn append_message(&mut self, _folder: &str, _content: &[u8]) -> Result<()> {
        println!("[Mock] Appending message ({} bytes) to {}", _content.len(), _folder);
        Ok(())
    }
}

pub struct MockMailSender;

#[async_trait]
impl MailSender for MockMailSender {
    async fn send_email(&self, request: &SendEmailRequest) -> Result<SendEmailResult> {
        println!(
            "[Mock] Sending SMTP email: {} -> {} with {} attachments",
            request.from,
            request.to.join(","),
            request.attachments.len()
        );
        let msg_id = format!("<{}@mock-send.local>", uuid::Uuid::new_v4());
        Ok(SendEmailResult {
            raw: b"Mock MIME Message Content".to_vec(),
            message_id: msg_id,
        })
    }
}
