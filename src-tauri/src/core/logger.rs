use chrono::Local;
use once_cell::sync::Lazy;
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

static LOG_FILE: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

pub fn init_logger(app_dir: PathBuf) {
    let log_dir = app_dir.join("logs");
    let _ = create_dir_all(&log_dir);
    let log_path = log_dir.join("app.log");
    let mut guard = LOG_FILE.lock().unwrap();
    *guard = Some(log_path);
}

pub fn log(level: &str, message: &str) {
    let guard = LOG_FILE.lock().unwrap();
    if let Some(path) = guard.as_ref() {
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let now = Local::now().format("%Y-%m-%d %H:%M:%S");
            let _ = writeln!(file, "[{}] [{}] {}", now, level, message);
        }
    }
    // Also print to stdout for dev
    println!("[{}] {}", level, message);
}

#[macro_export]
macro_rules! info {
    ($($arg:tt)*) => {
        $crate::core::logger::log("INFO", &format!($($arg)*));
    };
}

#[macro_export]
macro_rules! error {
    ($($arg:tt)*) => {
        $crate::core::logger::log("ERROR", &format!($($arg)*));
    };
}

#[macro_export]
macro_rules! warn {
    ($($arg:tt)*) => {
        $crate::core::logger::log("WARN", &format!($($arg)*));
    };
}
