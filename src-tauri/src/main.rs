#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    contextmeld_core::desktop::run();
}
