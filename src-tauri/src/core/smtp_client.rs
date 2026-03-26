use super::traits::MailSender;
use anyhow::{Context, Result};
use async_trait::async_trait;
use lettre::{transport::smtp::authentication::Credentials, Message, SmtpTransport, Transport, transport::smtp::client::Tls};

pub struct RealSmtpClient {
    host: String,
    port: u16,
    use_tls: bool,
}

impl RealSmtpClient {
    pub fn new(host: &str, port: u16, use_tls: bool) -> Self {
        Self {
            host: host.to_string(),
            port,
            use_tls,
        }
    }
}

#[async_trait]
impl MailSender for RealSmtpClient {
    async fn send_email(
        &self,
        from: &str,
        to: &str,
        subject: &str,
        body: &str,
        attachments: Vec<String>,
    ) -> Result<(Vec<u8>, String)> {
        use lettre::message::{Attachment, MultiPart, SinglePart, header::ContentType, header::MessageId};

        let password = crate::core::security::SecurityService::get_password(from)
            .context("Failed to get password for SMTP")?;

        let raw_msg_id = uuid::Uuid::new_v4().to_string();
        let msg_id_domain = from.split('@').nth(1).unwrap_or("nexus-mail.local");
        let msg_id_val = format!("<{}@{}>", raw_msg_id, msg_id_domain);

        let builder = Message::builder()
            .from(from.parse()?)
            .to(to.parse()?)
            .subject(subject)
            .message_id(Some(msg_id_val.clone()));

        let email = if attachments.is_empty() {
            builder.header(ContentType::TEXT_PLAIN).body(body.to_string())?
        } else {
            let mut multipart = MultiPart::mixed()
                .singlepart(SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(body.to_string()));

            for path in attachments {
                let path_buf = std::path::Path::new(&path);
                let filename = path_buf.file_name()
                    .and_then(|fs| fs.to_str())
                    .unwrap_or("attachment")
                    .to_string();
                
                let content = std::fs::read(&path)
                    .with_context(|| format!("Failed to read attachment at {}", path))?;
                
                // 简单的 MIME 检测 (也可以使用 mime_guess)
                let mime = "application/octet-stream";
                
                multipart = multipart.singlepart(
                    Attachment::new(filename)
                        .body(content, ContentType::parse(mime)?)
                );
            }
            builder.multipart(multipart)?
        };

        let creds = Credentials::new(from.to_string(), password);

        let mut mailer_builder = SmtpTransport::relay(&self.host)?
            .port(self.port)
            .credentials(creds);

        if !self.use_tls {
            mailer_builder = mailer_builder.tls(Tls::None);
        }

        let mailer = mailer_builder.build();

        mailer
            .send(&email)
            .map_err(|e| anyhow::anyhow!("SMTP Error: {}", e))?;

        Ok((email.formatted(), msg_id_val))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_servers::MockServers;
    use crate::core::security::SecurityService;
    use std::thread;
    use std::time::Duration;

    #[tokio::test]
    async fn test_send_email_with_password() {
        // 1. 启动模拟服务器
        thread::spawn(|| {
            let _ = MockServers::start_all();
        });
        thread::sleep(Duration::from_millis(800));

        // 2. 准备客户端 (禁用 TLS 对应 MockServer)
        let client = RealSmtpClient::new("127.0.0.1", 1465, false);
        let from = "demo@nexus-mail.com";
        
        // 3. 设置密码
        SecurityService::set_password(from, "pass").unwrap();

        // 4. 发送邮件
        let result = client.send_email(
            from,
            "receiver@test.com",
            "Test Subject",
            "Test Body",
            vec![]
        ).await;

        assert!(result.is_ok(), "Sending should succeed when password is set: {:?}", result.err());
    }

    #[tokio::test]
    async fn test_send_email_fails_without_password() {
        let client = RealSmtpClient::new("127.0.0.1", 1465, false);
        let from = "unknown@test.com";
        SecurityService::delete_password(from).ok();

        let result = client.send_email(from, "to@test.com", "sub", "body", vec![]).await;
        assert!(result.is_err());
        let err_msg = format!("{:?}", result.unwrap_err());
        assert!(err_msg.contains("Password not found"));
    }
}
