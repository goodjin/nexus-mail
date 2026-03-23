# Walkthrough - Integrated Mock Debug Environment

We have established a robust, network-isolated development environment that allows for immediate testing of all email features.

## New Feature: Debug Startup Script (M16)

### 1. One-Click Mock Startup
A new script `scripts/dev-mock.sh` has been created. It manages the lifecycle of the mock servers and the client simultaneously.

**Usage**:
```bash
./scripts/dev-mock.sh
```

**What it does**:
- Sets `NEXUS_DEV_MOCK=1` to signal the Rust backend.
- The backend automatically starts local IMAP (1993) and SMTP (1465) servers.
- Launches the Tauri development window.

### 2. Automatic Data Seeding
Upon first launch (or if the database is reset), the application automatically detects the absence of accounts and seeds the following mock credentials:
- **Email**: `demo@nexus-mail.com`
- **Password**: `pass`
- **IMAP**: `127.0.0.1:1993`
- **SMTP**: `127.0.0.1:1465`

The application will automatically select this account, presenting a populated inbox of 100 mock emails ready for testing.

## Summary of Completed Work
- [x] **Protocols**: Mock IMAP and SMTP servers supporting full session lifecycle.
- [x] **Content**: Realistic MIME parsing with HTML and attachments.
- [x] **Security**: Local AES-GCM encryption for credentials, bypassing system Keychain.
- [x] **Scripting**: Unified startup flow for development.

## Verification
I have verified that the `std::env::var("NEXUS_DEV_MOCK")` check correctly gates the mock servers. Running the app normally (`npm run tauri dev`) will *not* start the mock servers unless the environment variable is explicitly provided.
