//! Locating the user's TeX distribution.
//!
//! A GUI application launched from Finder or the Dock does not inherit the
//! login shell's `PATH`, so `latexmk` is almost never on `PATH` for a bundled
//! macOS app even when it works fine in Terminal. We therefore build an
//! augmented search path from the standard installation prefixes of TeX Live,
//! MacTeX and MiKTeX, and use it for every toolchain invocation.

use crate::models::{TexBinary, TexEnvironment};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

/// Engines and helpers we probe for, in reporting order.
const PROBED_BINARIES: &[&str] = &[
    "latexmk",
    "pdflatex",
    "xelatex",
    "lualatex",
    "biber",
    "bibtex",
    "makeindex",
];

/// Directories to append to `PATH` when searching for the toolchain.
fn candidate_directories() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // MacTeX's stable symlink farm; present for every MacTeX install.
        dirs.push(PathBuf::from("/Library/TeX/texbin"));
        dirs.push(PathBuf::from("/usr/texbin"));
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
        dirs.extend(glob_texlive_bins("/usr/local/texlive"));
    }

    #[cfg(target_os = "linux")]
    {
        dirs.push(PathBuf::from("/usr/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
        dirs.extend(glob_texlive_bins("/usr/local/texlive"));
        dirs.extend(glob_texlive_bins("/opt/texlive"));
        if let Some(home) = home_dir() {
            dirs.extend(glob_texlive_bins(home.join("texlive")));
        }
    }

    #[cfg(target_os = "windows")]
    {
        for base in [
            r"C:\texlive",
            r"C:\Program Files\MiKTeX\miktex\bin\x64",
            r"C:\Program Files\MiKTeX 2.9\miktex\bin\x64",
        ] {
            let path = PathBuf::from(base);
            if path.join("miktex-pdftex.exe").exists() || path.join("pdflatex.exe").exists() {
                dirs.push(path.clone());
            }
            dirs.extend(glob_texlive_bins(base));
        }
        if let Some(local) = env::var_os("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local).join(r"Programs\MiKTeX\miktex\bin\x64"));
        }
    }

    dirs.retain(|d| d.is_dir());
    dirs
}

/// TeX Live installs as `<base>/<year>/bin/<arch>/`. Enumerate those without
/// hard-coding the year or CPU architecture.
fn glob_texlive_bins(base: impl AsRef<Path>) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let Ok(years) = std::fs::read_dir(base.as_ref()) else {
        return found;
    };

    for year in years.flatten() {
        let bin = year.path().join("bin");
        let Ok(arches) = std::fs::read_dir(&bin) else {
            continue;
        };
        for arch in arches.flatten() {
            if arch.path().is_dir() {
                found.push(arch.path());
            }
        }
    }
    // Newest install last so it takes precedence when prepended in reverse.
    found.sort();
    found.reverse();
    found
}

/// Only Linux looks for a per-user TeX Live install.
#[cfg(target_os = "linux")]
fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME").map(PathBuf::from)
}

/// The `PATH` value used for all toolchain invocations: the inherited `PATH`
/// first (so an explicitly configured toolchain wins), then our candidates.
pub fn search_path() -> String {
    static CACHE: OnceLock<String> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let mut entries: Vec<PathBuf> = env::var_os("PATH")
                .map(|p| env::split_paths(&p).collect())
                .unwrap_or_default();

            for dir in candidate_directories() {
                if !entries.contains(&dir) {
                    entries.push(dir);
                }
            }

            env::join_paths(entries)
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default()
        })
        .clone()
}

/// Locate `program` on the augmented search path.
pub fn find_binary(program: &str) -> Option<PathBuf> {
    let exe_names: Vec<String> = if cfg!(windows) {
        vec![
            format!("{program}.exe"),
            format!("{program}.bat"),
            program.to_string(),
        ]
    } else {
        vec![program.to_string()]
    };

    for dir in env::split_paths(&search_path()) {
        for name in &exe_names {
            let candidate = dir.join(name);
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

/// First line of `<program> --version`, trimmed. Used only for display.
fn probe_version(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .find(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
}

/// Infer the distribution name from an engine's version banner.
fn distribution_from(version: &str) -> Option<String> {
    let lower = version.to_ascii_lowercase();
    if lower.contains("miktex") {
        Some("MiKTeX".into())
    } else if lower.contains("tex live") || lower.contains("texlive") {
        // e.g. "pdfTeX 3.141592653-2.6-1.40.25 (TeX Live 2023)"
        version
            .rfind("TeX Live")
            .map(|i| version[i..].trim_end_matches(&[')', ' '][..]).to_string())
            .or_else(|| Some("TeX Live".into()))
    } else {
        None
    }
}

/// Probe the machine and describe what is available.
pub fn detect_environment() -> TexEnvironment {
    let mut binaries = Vec::new();
    let mut distribution = None;

    for name in PROBED_BINARIES {
        if let Some(path) = find_binary(name) {
            let version = probe_version(&path);
            if distribution.is_none() {
                if let Some(v) = version.as_deref() {
                    distribution = distribution_from(v);
                }
            }
            binaries.push(TexBinary {
                name: (*name).to_string(),
                path: path.to_string_lossy().into_owned(),
                version,
            });
        }
    }

    let has_latexmk = binaries.iter().any(|b| b.name == "latexmk");
    // latexmk alone is not enough — it is a Perl driver with no engine.
    let installed = binaries
        .iter()
        .any(|b| matches!(b.name.as_str(), "pdflatex" | "xelatex" | "lualatex"));

    TexEnvironment {
        installed,
        has_latexmk,
        distribution,
        binaries,
        search_path: search_path(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_path_includes_inherited_entries() {
        let path = search_path();
        assert!(!path.is_empty());
    }

    #[test]
    fn distribution_is_inferred_from_banner() {
        assert_eq!(
            distribution_from("MiKTeX-pdfTeX 4.12 (MiKTeX 23.4)").as_deref(),
            Some("MiKTeX")
        );
        assert!(distribution_from("pdfTeX 3.14 (TeX Live 2023)")
            .unwrap()
            .starts_with("TeX Live"));
        assert_eq!(distribution_from("something else"), None);
    }
}
