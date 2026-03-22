#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod core;

fn main() {
    nexus_mail_lib::run()
}
