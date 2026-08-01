//! InkTex — a local-first desktop LaTeX editor.
//!
//! The Rust side owns everything that touches the operating system: the
//! filesystem, the TeX toolchain and the file watcher. The React frontend owns
//! presentation and editing state. They meet at the command list registered in
//! [`run`], and at three event channels:
//!
//! | Event                   | Payload                | Meaning                          |
//! |-------------------------|------------------------|----------------------------------|
//! | `compile://started`     | `CompileStartedEvent`  | A build began                    |
//! | `compile://output`      | `CompileOutputEvent`   | One line of toolchain output     |
//! | `compile://finished`    | `CompileResult`        | A build ended                    |
//! | `project://fs-changed`  | `FsChangeEvent`        | Debounced filesystem changes     |
//! | `project://watch-error` | `String`               | The watcher could not be started |

pub mod commands;
pub mod error;
pub mod latex;
pub mod models;
pub mod paths;
pub mod state;
pub mod store;
pub mod tree;
pub mod watcher;

use state::AppState;

/// Build and run the application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        // Release a window's project, watcher and compile slot when it closes,
        // so a background build cannot outlive the window that started it.
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                window.state::<AppState>().remove_window(window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Project lifecycle
            commands::project::open_project,
            commands::project::create_project,
            commands::project::reload_project,
            commands::project::refresh_tree,
            commands::project::set_main_document,
            commands::project::close_project,
            commands::project::get_recent_projects,
            commands::project::remove_recent_project,
            commands::project::clear_recent_projects,
            // Filesystem
            commands::fs_ops::read_text_file,
            commands::fs_ops::write_text_file,
            commands::fs_ops::read_binary_file,
            commands::fs_ops::read_pdf_file,
            commands::fs_ops::create_file,
            commands::fs_ops::create_directory,
            commands::fs_ops::rename_entry,
            commands::fs_ops::move_entry,
            commands::fs_ops::delete_entry,
            commands::fs_ops::import_file,
            commands::fs_ops::path_exists,
            commands::fs_ops::inspect_paths,
            commands::fs_ops::export_pdf,
            // Compilation
            commands::compile::get_tex_environment,
            commands::compile::compile_project,
            commands::compile::cancel_compile,
            commands::compile::is_compiling,
            commands::compile::clean_auxiliary_files,
            commands::compile::get_output_directory,
            // Preferences
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::get_session,
            commands::settings::save_session,
            // Desktop integration
            commands::system::open_new_window,
            commands::system::get_platform_info,
            commands::system::reveal_in_file_manager,
            commands::system::open_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start InkTex");
}
