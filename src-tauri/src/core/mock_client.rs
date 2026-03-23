use super::traits::{MailClient, MailSender, FolderInfo, EmailSummary, EmailDetails};
use async_trait::async_trait;
use anyhow::Result;

pub struct MockMailClient {
    pub is_connected: bool,
}

impl MockMailClient {
    pub fn new() -> Self {
        Self { is_connected: false }
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
            FolderInfo { id: "mock-inbox".into(), name: "收件箱".into(), remote_id: "INBOX".into(), unread_count: 128 },
            FolderInfo { id: "mock-flagged".into(), name: "重要邮件".into(), remote_id: "FLAGGED".into(), unread_count: 999 },
            FolderInfo { id: "mock-drafts".into(), name: "草稿箱".into(), remote_id: "Drafts".into(), unread_count: 2 },
            FolderInfo { id: "mock-sent".into(), name: "已发送".into(), remote_id: "Sent".into(), unread_count: 0 },
            FolderInfo { id: "mock-junk".into(), name: "垃圾邮件".into(), remote_id: "Junk".into(), unread_count: 42 },
            FolderInfo { id: "mock-nexus".into(), name: "工作/项目/Nexus".into(), remote_id: "Work/Nexus".into(), unread_count: 0 },
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
        });

        emails.push(EmailSummary {
            uid: "1002".into(),
            subject: "Re: 您的订阅已更新".into(),
            from: "billing@service.com".into(),
            date: "2026-03-19 22:10".into(),
            snippet: "感谢您订阅我们的高级计划。您的下一份账单将在 4 月 19 日生成...".into(),
        });

        Ok(emails)
    }

    async fn get_emails_since(&mut self, _folder: &str, last_uid: u32) -> Result<Vec<EmailSummary>> {
        println!("[Mock] Incremental fetch since UID {}", last_uid);
        // 模拟只返回一封新邮件
        Ok(vec![
            EmailSummary {
                uid: (last_uid + 1).to_string(),
                subject: "新到来的增量邮件".into(),
                from: "new@example.com".into(),
                date: "2026-03-20 16:30".into(),
                snippet: "这是模拟增量同步后新抓取到的邮件体验。".into(),
            }
        ])
    }

    async fn get_email_details(&mut self, _folder: &str, uid: &str) -> Result<EmailDetails> {
        Ok(EmailDetails {
            uid: uid.into(),
            body_html: Some(format!("<html><body><h1>内容预览</h1><p>UID: {}</p></body></html>", uid)),
            body_text: Some(format!("UID: {}", uid)),
            attachments: vec![],
        })
    }

    async fn get_attachment(&mut self, _folder: &str, _uid: &str, _attachment_id: &str) -> Result<Vec<u8>> {
        Ok(vec![0; 100])
    }

    async fn set_flag(&mut self, _folder: &str, _uid: &str, _flag: &str, _value: bool) -> Result<()> {
        todo!()
    }

    async fn delete_email(&mut self, _folder: &str, _uid: &str) -> Result<()> {
        Ok(())
    }
}

pub struct MockMailSender;

#[async_trait]
impl MailSender for MockMailSender {
    async fn send_email(&self, from: &str, to: &str, _subject: &str, _body: &str) -> Result<()> {
        println!("[Mock] Sending SMTP email: {} -> {}", from, to);
        Ok(())
    }
}
