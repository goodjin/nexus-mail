#!/bin/bash

# Nexus Mail Debug Startup Script (Mock Mode)
# ------------------------------------------
# This script starts the application with mock IMAP/SMTP servers 
# and automatically seeds a demo account.

echo "🚀 Starting Nexus Mail in Mock Mode..."

# 1. Environment variables for the Rust backend
export NEXUS_DEV_MOCK=1

# 2. Cleanup old dev data (optional, but ensures fresh start)
# rm -rf "$HOME/Library/Application Support/com.nexus.mail/nexus-mail.db"

# 3. Launch Tauri dev
npm run tauri dev
