//! Integration with the host desktop: file manager, terminal, external apps.

use crate::error::{AppError, AppResult, ErrorKind};
use crate::latex::detect;
use crate::state::AppState;
use serde::Serialize;
use std::path::Path;
use std::process::Command;
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
pub fn open_terminal(state: State<'_, AppState>) -> AppResult<()> {
    let root = state.project.require()?;

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
