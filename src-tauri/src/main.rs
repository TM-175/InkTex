// Hide the console window that Windows would otherwise attach to a GUI build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    inktex_lib::run();
}
