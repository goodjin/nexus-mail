use super::traits::MailSender;
use async_trait::async_trait;
use anyhow::{Result, Context};
use lettre::{Message, transport::smtp::authentication::Credentials, SmtpTransport, Transport};

pub struct RealSmtpClient {
    host: String,
    port: u16,
}

impl RealSmtpClient {
    pub fn new(host: &str, port: u16) -> Self {
        Self {
            host: host.to_string(),
            port,
        }
    }
}

#[async_trait]
impl MailSender for RealSmtpClient {
    async fn send_email(&self, from: &str, to: &str, subject: &str, body: &str) -> Result<()> {
        // 获取密码 (从 SecurityService)
        let password = crate::core::security::SecurityService::get_password(from)
            .context("Failed to get password for SMTP")?;

        let email = Message::builder()
            .from(from.parse()?)
            .to(to.parse()?)
            .subject(subject)
            .body(body.to_string())?;

        let creds = Credentials::new(from.to_string(), password);

        // 创建 SMTP 传输
        let mailer = SmtpTransport::relay(&self.host)?
            .port(self.port)
            .credentials(creds)
            .build();

        // 发送邮件 (lettre 的 send 是阻塞的，在 async 环境下需要注意，或者使用 async-transport)
        // 注意：lettre 0.11 支持 tokio1 特性实现异步发送
        mailer.send(&email).map_err(|e| anyhow::anyhow!("SMTP Error: {}", e))?;

        Ok(())
    }
}
