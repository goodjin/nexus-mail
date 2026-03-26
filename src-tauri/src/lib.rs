use tauri::Manager;
pub mod commands;
pub mod core;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if std::env::var("NEXUS_DEV_MOCK").is_ok() {
        crate::core::test_servers::MockServers::start_all();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 在生产环境中获取 app_data 目录
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            if !app_data_dir.exists() {
                std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            }

            // 初始化日志
            core::logger::init_logger(app_data_dir.clone());
            crate::info!("Nexus Mail Backend Starting...");

            // 获取或生成数据库加密密钥 (SecurityService)
            let db_key = core::security::SecurityService::get_or_create_db_key()
                .expect("Failed to initialize security service / keyring");

            // 初始化数据库 (async)
            let db = tauri::async_runtime::block_on(async {
                println!(
                    "Connecting to database at: {:?}",
                    app_data_dir.join("nexus.db")
                );
                core::database::Database::new(&app_data_dir, &db_key)
                    .await
                    .expect("Failed to initialize database")
            });

            // 初始化同步引擎
            let engine = core::sync_engine::SyncEngine::new(db.clone());

            // 初始化同步引擎
            let engine = core::sync_engine::SyncEngine::new(db.clone());

            // 注入全局状态，供 Commands 使用
            app.manage(db);
            app.manage(engine);

            // 启动本地 Mock 测试服务器
            core::test_servers::MockServers::start_all();

            println!("Nexus Mail Backend Initialized at {:?}", app_data_dir);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_accounts,
            commands::get_folders,
            commands::get_emails,
            commands::get_email_details,
            commands::get_attachment,
            crate::commands::dev_seed_data,
            crate::commands::reset_database,
            commands::update_email_flag,
            commands::delete_email,
            commands::search_emails,
            commands::sync_account,
            commands::send_email,
            commands::get_settings,
            commands::update_setting,
            commands::get_accounts_detailed,
            commands::update_account_details,
            commands::update_account_password,
            commands::test_account_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
