//! Integration with the host desktop: file manager, terminal, external apps.

use crate::error::{AppError, AppResult, ErrorKind};
use crate::latex::detect;
use crate::state::AppState;
use serde::Serialize;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Manager};
// Only the Linux code paths need to silence child output.
#[cfg(target_os = "linux")]
use std::process::Stdio;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    /// Label for the primary modifier key, used in shortcut hints.
    pub modifier_label: String,
    pub tex_search_path: String,
}

/// Open an additional InkTex window.
///
/// Each window is an independent workspace with its own project, compile slot
/// and file watcher (see [`crate::state::AppState`]), so the new one starts at
/// the welcome screen rather than mirroring this one.
#[tauri::command]
pub async fn open_new_window(app: AppHandle) -> AppResult<String> {
    // Labels must be unique for the lifetime of the app; a counter would repeat
    // one after a window is closed and reopened, so use the clock.
    let label = format!("main-{}", crate::latex::engine::epoch_millis());

    let builder =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title("InkTex")
            .inner_size(1440.0, 900.0)
            .min_inner_size(900.0, 600.0)
            .resizable(true)
            .center();

    // The frontend draws its own title bar and insets it for the traffic
    // lights, so a second window has to use the same overlay chrome as the one
    // in `tauri.conf.json` — otherwise it gets a second, native title bar and
    // 80px of empty space where the traffic lights are not.
    #[cfg(target_os = "macos")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay);

    let window = builder.build().map_err(|e| {
        AppError::new(
            ErrorKind::Internal,
            format!("A new window could not be opened: {e}"),
        )
    })?;

    crate::platform::hide_native_title(&window);

    // Offset each new window so it does not land exactly on the previous one.
    if let Ok(position) = window.outer_position() {
        let offset = 28 * (app.state::<AppState>().window_count().max(1) as i32);
        let _ = window.set_position(tauri::PhysicalPosition::new(
            position.x + offset,
            position.y + offset,
        ));
    }

    Ok(label)
}

#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        modifier_label: if cfg!(target_os = "macos") {
            "⌘".into()
        } else {
            "Ctrl".into()
        },
        tex_search_path: detect::search_path(),
    }
}

/// Show a file or folder in the platform file manager, selecting it.
#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> AppResult<()> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(AppError::not_found(format!("“{path}”")));
    }

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg("-R").arg(target).spawn();

    #[cfg(target_os = "windows")]
    let result = Command::new("explorer")
        .arg(format!("/select,{}", target.display()))
        .spawn();

    #[cfg(target_os = "linux")]
    let result = {
        // Prefer the freedesktop file-manager interface, which selects the
        // file; fall back to opening its parent folder.
        let dbus = Command::new("dbus-send")
            .args([
                "--session",
                "--dest=org.freedesktop.FileManager1",
                "--type=method_call",
                "/org/freedesktop/FileManager1",
                "org.freedesktop.FileManager1.ShowItems",
                &format!("array:string:file://{}", target.display()),
                "string:",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        match dbus {
            Ok(status) if status.success() => Ok(()),
            _ => {
                let folder = if target.is_dir() {
                    target
                } else {
                    target.parent().unwrap_or(target)
                };
                Command::new("xdg-open").arg(folder).spawn().map(|_| ())
            }
        }
    };

    result.map(|_| ()).map_err(|e| {
        AppError::new(
            ErrorKind::Io,
            format!("Could not open the file manager: {e}"),
        )
    })
}

/// Open a terminal window whose working directory is the project root.
#[tauri::command]
pub fn open_terminal(window: tauri::Window, state: State<'_, AppState>) -> AppResult<()> {
    let root = state.for_window(window.label()).project.require()?;

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal"])
            .arg(&root)
            .spawn()
            .map_err(|e| AppError::new(ErrorKind::Io, format!("Could not open Terminal: {e}")))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        // `start` is a cmd builtin, so it must run through cmd itself.
        Command::new("cmd")
            .args(["/C", "start", "cmd", "/K", "cd", "/d"])
            .arg(&root)
            .spawn()
            .map_err(|e| {
                AppError::new(ErrorKind::Io, format!("Could not open Command Prompt: {e}"))
            })?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        // No standard way to do this; try the common emulators in turn.
        const TERMINALS: &[(&str, &[&str])] = &[
            ("x-terminal-emulator", &[]),
            ("gnome-terminal", &["--working-directory"]),
            ("konsole", &["--workdir"]),
            ("xfce4-terminal", &["--working-directory"]),
            ("alacritty", &["--working-directory"]),
            ("kitty", &["--directory"]),
            ("xterm", &[]),
        ];

        for (program, flags) in TERMINALS {
            if detect::find_binary(program).is_none() {
                continue;
            }
            let mut command = Command::new(program);
            if flags.is_empty() {
                command.current_dir(&root);
            } else {
                for flag in *flags {
                    command.arg(flag);
                }
                command.arg(&root);
            }
            if command
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .is_ok()
            {
                return Ok(());
            }
        }

        return Err(
            AppError::new(ErrorKind::Io, "No supported terminal emulator was found.").with_hint(
                "Install one of: gnome-terminal, konsole, xfce4-terminal, alacritty, kitty.",
            ),
        );
    }

    #[allow(unreachable_code)]
    Ok(())
}
