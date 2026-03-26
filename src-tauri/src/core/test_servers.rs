use anyhow::Result;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

pub struct MockServers;

impl MockServers {
    pub fn start_all() {
        thread::spawn(|| {
            let _ = Self::start_imap(1993);
        });
        thread::spawn(|| {
            let _ = Self::start_smtp(1465);
        });
        println!("[MockServers] Started IMAP on 1993 and SMTP on 1465");
    }

    fn start_imap(port: u16) -> Result<()> {
        let listener = TcpListener::bind(format!("127.0.0.1:{}", port))?;
        for stream in listener.incoming() {
            let stream = stream?;
            thread::spawn(move || {
                let _ = Self::handle_imap(stream);
            });
        }
        Ok(())
    }

    fn handle_imap(mut stream: TcpStream) -> Result<()> {
        stream.write_all(b"* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] Mock IMAP Server Ready\r\n")?;

        let mut buffer = [0; 1024];
        loop {
            let n = stream.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            let cmd = String::from_utf8_lossy(&buffer[..n]);
            let lines: Vec<&str> = cmd.split("\r\n").filter(|l| !l.is_empty()).collect();

            for line in lines {
                println!("[IMAP-Server] Recv: {}", line);
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() < 2 {
                    continue;
                }
                let tag = parts[0];
                let command = parts[1].to_uppercase();

                match command.as_str() {
                    "CAPABILITY" => {
                        stream.write_all(format!("* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n{} OK CAPABILITY completed\r\n", tag).as_bytes())?;
                    }
                    "LOGIN" => {
                        stream.write_all(format!("{} OK LOGIN completed\r\n", tag).as_bytes())?;
                    }
                    "LIST" => {
                        stream.write_all(b"* LIST (\\HasNoChildren) \"/\" \"INBOX\"\r\n")?;
                        stream.write_all(b"* LIST (\\HasNoChildren) \"/\" \"Sent\"\r\n")?;
                        stream.write_all(format!("{} OK LIST completed\r\n", tag).as_bytes())?;
                    }
                    "SEARCH" => {
                        let mut resp = String::from("* SEARCH");
                        for i in 1001..=1100 {
                            resp.push_str(&format!(" {}", i));
                        }
                        resp.push_str("\r\n");
                        stream.write_all(resp.as_bytes())?;
                        stream.write_all(format!("{} OK SEARCH completed\r\n", tag).as_bytes())?;
                    }
                    "NOOP" => {
                        stream.write_all(format!("{} OK NOOP completed\r\n", tag).as_bytes())?;
                    }
                    "SELECT" => {
                        stream.write_all(b"* 100 EXISTS\r\n")?;
                        stream.write_all(b"* 0 RECENT\r\n")?;
                        stream.write_all(
                            format!("{} OK [READ-WRITE] SELECT completed\r\n", tag).as_bytes(),
                        )?;
                    }
                    "FETCH" | "UID" => {
                        let is_uid = command == "UID";
                        let offset = if is_uid { 1 } else { 0 };
                        if parts.len() >= 3 + offset {
                            let range_str = parts[2 + offset];
                            let (start, end) = if range_str.contains(':') {
                                let r: Vec<&str> = range_str.split(':').collect();
                                (
                                    r[0].parse::<u32>().unwrap_or(1),
                                    r[1].parse::<u32>().unwrap_or(100),
                                )
                            } else if range_str == "*" {
                                (1, 100)
                            } else {
                                let n = range_str.parse::<u32>().unwrap_or(1);
                                (n, n)
                            };

                            if line.contains("RFC822.HEADER") {
                                let mut generated = 0;
                                for i in start..=end {
                                    if i > 1100 { break; }
                                    if i < 1001 { continue; }
                                    let idx = i - 1000;
                                    let header = format!("From: sender-{}@mock.com\r\nSubject: Mock Mail #{}\r\nDate: Mon, 23 Mar 2026 00:00:00 +0800\r\n\r\n", idx, idx);
                                    let resp = format!(
                                        "* {} FETCH (UID {} RFC822.HEADER {{{}}}\r\n{})\r\n",
                                        idx,
                                        i,
                                        header.len(),
                                        header
                                    );
                                    stream.write_all(resp.as_bytes())?;
                                    generated += 1;
                                    if generated >= 150 { break; }
                                }
                            } else if line.contains("BODY[]") || line.contains("RFC822") {
                                let (fetch_uid, index) = if line.starts_with("UID") {
                                    let uid_val = line
                                        .split_whitespace()
                                        .nth(2)
                                        .and_then(|s| s.parse::<u32>().ok())
                                        .unwrap_or(1001);
                                    (uid_val, if uid_val > 1000 { uid_val - 1000 } else { 1 })
                                } else {
                                    (start, if start > 1000 { start - 1000 } else { 1 })
                                };

                                let boundary = "boundary123";
                                let rfc822 = format!(
                                    "MIME-Version: 1.0\r\n\
Content-Type: multipart/mixed; boundary={}\r\n\
Subject: Mock Detailed\r\n\
\r\n\
--{}\r\n\
Content-Type: text/html; charset=utf-8\r\n\
\r\n\
<html><body><h1>Deep Content</h1><p>Test body</p></body></html>\r\n\
--{}\r\n\
Content-Type: text/plain; name=\"test.txt\"\r\n\
Content-Disposition: attachment; filename=\"test.txt\"\r\n\
\r\n\
Attachment Data: Hello World\r\n\
--{}--\r\n",
                                    boundary, boundary, boundary, boundary
                                );
                                let resp = format!(
                                    "* {} FETCH (UID {} BODY[] {{{}}}\r\n{})\r\n",
                                    index,
                                    fetch_uid,
                                    rfc822.len(),
                                    rfc822
                                );
                                println!("[IMAP-Server] Send multipart body for UID {}", fetch_uid);
                                stream.write_all(resp.as_bytes())?;
                            }
                            let ok_resp = format!("{} OK {} completed\r\n", tag, command);
                            stream.write_all(ok_resp.as_bytes())?;
                        }
                    }
                    _ => {
                        stream
                            .write_all(format!("{} OK {} ignored\r\n", tag, command).as_bytes())?;
                    }
                }
            }
        }
        println!("[IMAP-Server] Session closed");
        Ok(())
    }

    fn start_smtp(port: u16) -> Result<()> {
        let listener = TcpListener::bind(format!("127.0.0.1:{}", port))?;
        for stream in listener.incoming() {
            let stream = stream?;
            thread::spawn(move || {
                let _ = Self::handle_smtp(stream);
            });
        }
        Ok(())
    }

    fn handle_smtp(mut stream: TcpStream) -> Result<()> {
        println!("[SMTP-Server] New connection");
        stream.write_all(b"220 Mock SMTP Server Ready\r\n")?;

        let mut buffer = [0; 4096];
        let mut has_subject = false;
        let mut has_from = false;
        let mut has_to = false;

        loop {
            let n = stream.read(&mut buffer)?;
            if n == 0 {
                println!("[SMTP-Server] Connection closed by client");
                break;
            }
            let cmd = String::from_utf8_lossy(&buffer[..n]);
            for line in cmd.lines() {
                if line.is_empty() {
                    continue;
                }
                println!("[SMTP-Server] Recv: {}", line);

                if line.to_uppercase().starts_with("SUBJECT:") {
                    has_subject = true;
                }
                if line.to_uppercase().starts_with("FROM:") {
                    has_from = true;
                }
                if line.to_uppercase().starts_with("TO:") {
                    has_to = true;
                }

                let first_word = line.split_whitespace().next().unwrap_or("").to_uppercase();

                match first_word.as_str() {
                    "EHLO" | "HELO" => {
                        stream
                            .write_all(b"250-Mock SMTP Server\r\n250-AUTH LOGIN\r\n250 OK\r\n")?;
                    }
                    "AUTH" => {
                        stream.write_all(b"334 VXNlcm5hbWU6\r\n")?;
                    }
                    "MAIL" | "RCPT" => {
                        stream.write_all(b"250 OK\r\n")?;
                    }
                    "DATA" => {
                        stream.write_all(b"354 Start mail input\r\n")?;
                    }
                    "QUIT" => {
                        stream.write_all(b"221 Bye\r\n")?;
                        return Ok(());
                    }
                    "." => {
                        if has_subject && has_from && has_to {
                            stream.write_all(b"250 OK: queued\r\n")?;
                        } else {
                            println!(
                                "[SMTP-Server] Error: missing headers (S={}, F={}, T={})",
                                has_subject, has_from, has_to
                            );
                            stream.write_all(
                                b"554 Error: missing required headers (Subject, From, To)\r\n",
                            )?;
                        }
                        has_subject = false;
                        has_from = false;
                        has_to = false;
                    }
                    _ => {
                        // 处理 Base64 的用户名和密码段
                        if line.len() > 2 {
                            if line.contains("=") || line.len() > 8 {
                                // 可能是 base64
                                if line.contains("pass") || line.len() > 20 || line == "cGFzcw==" {
                                    // cGFzcw== is "pass"
                                    stream.write_all(b"235 2.7.0 Authentication successful\r\n")?;
                                } else {
                                    stream.write_all(b"334 UGFzc3dvcmQ6\r\n")?;
                                }
                            }
                        }
                    }
                }
            }
        }
        println!("[SMTP-Server] Session finished");
        Ok(())
    }
}
