use super::traits::{MailSender, SendEmailRequest, SendEmailResult};
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

    pub fn test_connectivity(&self) -> Result<()> {
        let stream = std::net::TcpStream::connect((self.host.as_str(), self.port))?;
        if self.use_tls {
            let connector = native_tls::TlsConnector::builder().build()?;
            let _ = connector.connect(&self.host, stream)?;
        }
        Ok(())
    }
}

#[async_trait]
impl MailSender for RealSmtpClient {
    async fn send_email(&self, request: &SendEmailRequest) -> Result<SendEmailResult> {
        use lettre::message::{Attachment, MultiPart, SinglePart, header::ContentType, header::MessageId};

        let password = crate::core::security::SecurityService::get_password(&request.from)
            .context("Failed to get password for SMTP")?;

        let raw_msg_id = uuid::Uuid::new_v4().to_string();
        let msg_id_domain = request
            .from
            .split('@')
            .nth(1)
            .unwrap_or("nexus-mail.local");
        let msg_id_val = format!("<{}@{}>", raw_msg_id, msg_id_domain);

        let mut builder = Message::builder()
            .from(request.from.parse()?)
            .subject(&request.subject)
            .message_id(Some(msg_id_val.clone()));

        for recipient in &request.to {
            builder = builder.to(recipient.parse()?);
        }
        for recipient in &request.cc {
            builder = builder.cc(recipient.parse()?);
        }
        for recipient in &request.bcc {
            builder = builder.bcc(recipient.parse()?);
        }

        let email = if request.attachments.is_empty() {
            builder
                .header(ContentType::TEXT_PLAIN)
                .body(request.body.to_string())?
        } else {
            let mut multipart = MultiPart::mixed()
                .singlepart(SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(request.body.to_string()));

            for path in &request.attachments {
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

        let creds = Credentials::new(request.from.to_string(), password);

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

        Ok(SendEmailResult {
            raw: email.formatted(),
            message_id: msg_id_val,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_servers::MockServers;
    use crate::core::security::SecurityService;
    use std::io::Read;
    use std::net::TcpListener;
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
        let request = SendEmailRequest {
            from: from.to_string(),
            to: vec!["receiver@test.com".to_string()],
            cc: vec![],
            bcc: vec![],
            subject: "Test Subject".to_string(),
            body: "Test Body".to_string(),
            attachments: vec![],
        };
        let result = client.send_email(&request).await;

        assert!(result.is_ok(), "Sending should succeed when password is set: {:?}", result.err());
    }

    #[tokio::test]
    async fn test_send_email_fails_without_password() {
        let client = RealSmtpClient::new("127.0.0.1", 1465, false);
        let from = "unknown@test.com";
        SecurityService::delete_password(from).ok();

        let request = SendEmailRequest {
            from: from.to_string(),
            to: vec!["to@test.com".to_string()],
            cc: vec![],
            bcc: vec![],
            subject: "sub".to_string(),
            body: "body".to_string(),
            attachments: vec![],
        };
        let result = client.send_email(&request).await;
        assert!(result.is_err());
        let err_msg = format!("{:?}", result.unwrap_err());
        assert!(err_msg.contains("Password not found"));
    }

    #[test]
    fn test_smtp_connectivity_fails_on_tls_mismatch() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 8];
                let _ = stream.read(&mut buf);
            }
        });

        let client = RealSmtpClient::new("127.0.0.1", port, true);
        assert!(client.test_connectivity().is_err());
    }
}
