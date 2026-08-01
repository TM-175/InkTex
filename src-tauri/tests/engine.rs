//! Integration tests for the compile driver.
//!
//! These exercise the parts of [`inktex_lib::latex::engine`] that unit tests
//! cannot reach: spawning a real process, applying the environment, streaming
//! its output, assembling a [`CompileResult`], and killing a running build.
//!
//! A stub `latexmk` shell script stands in for the real toolchain, so the tests
//! run on a machine with no TeX installation. They are Unix-only because the
//! stub is a shell script.

#![cfg(unix)]

use inktex_lib::latex::engine::{self, RunContext};
use inktex_lib::models::{
    BibEngine, CompileRequest, CompileStatus, CompilerKind, DiagnosticSeverity, LatexmkEngine,
};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Once;
use std::time::{Duration, Instant};
use tauri::test::MockRuntime;

/// Root for everything these tests create.
fn sandbox() -> PathBuf {
    std::env::temp_dir().join("inktex-engine-tests")
}

fn stub_bin_dir() -> PathBuf {
    sandbox().join("bin")
}

/// A stub that mimics latexmk closely enough to drive the parser: it honours
/// `-outdir=`, writes a `.log` containing one error and one warning, emits a
/// PDF, and prints the lines the output panel highlights.
///
/// If the project contains a `SLOW` marker it blocks instead, which is how the
/// cancellation test gets something to interrupt. The marker is per-project, so
/// it cannot affect the other tests running in parallel.
const STUB_LATEXMK: &str = r#"#!/bin/sh
OUT="."
for arg in "$@"; do
  case "$arg" in
    -outdir=*) OUT="${arg#-outdir=}" ;;
  esac
done
mkdir -p "$OUT"

if [ -f ./SLOW ]; then
  echo "Latexmk: starting a long build"
  sleep 30
  echo "should never be reached"
  exit 0
fi

# Prove the environment InkTex sets actually reaches the process.
echo "STUB max_print_line=${max_print_line}"
echo "Latexmk: Run number 1 of rule 'pdflatex'"

cat > "$OUT/main.log" <<'LOG'
This is pdfTeX, Version 3.141592653 (TeX Live 2024)
(./main.tex
./main.tex:12: Undefined control sequence.
l.12 \badmacro
LaTeX Warning: Reference `fig:one' on page 1 undefined on input line 42.
)
Output written on main.pdf (1 page, 1234 bytes).
LOG

printf '%%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > "$OUT/main.pdf"
echo "Output written on main.pdf (1 page, 1234 bytes)."
exit 0
"#;

static SETUP: Once = Once::new();

/// Install the stubs and put them at the front of `PATH`.
///
/// `PATH` must be set before anything calls `detect::search_path`, which caches
/// it for the life of the process — hence the `Once`.
fn install_stubs() {
    SETUP.call_once(|| {
        let bin = stub_bin_dir();
        let _ = fs::remove_dir_all(sandbox());
        fs::create_dir_all(&bin).expect("create stub bin dir");

        let path = bin.join("latexmk");
        fs::write(&path, STUB_LATEXMK).expect("write stub");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).expect("chmod stub");

        let existing = std::env::var("PATH").unwrap_or_default();
        std::env::set_var("PATH", format!("{}:{}", bin.display(), existing));
    });
}

/// Create a project directory containing a minimal `main.tex`.
fn make_project(name: &str) -> PathBuf {
    let root = sandbox().join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("create project");
    fs::write(
        root.join("main.tex"),
        "\\documentclass{article}\n\\begin{document}\nhello\n\\end{document}\n",
    )
    .expect("write main.tex");
    root
}

fn request_for(root: &Path, compiler: CompilerKind) -> CompileRequest {
    CompileRequest {
        root: root.to_string_lossy().into_owned(),
        main_document: "main.tex".into(),
        compiler,
        latexmk_engine: LatexmkEngine::Pdflatex,
        bib_engine: BibEngine::Auto,
        use_output_directory: true,
        synctex: false,
        force: false,
        extra_args: Vec::new(),
    }
}

/// A run context backed by the mock runtime.
///
/// The `App` is returned alongside so callers can keep it alive; dropping it
/// would tear down the runtime the handle points at.
fn context(id: &str) -> (tauri::App<MockRuntime>, RunContext<MockRuntime>) {
    let app = tauri::test::mock_app();
    let handle = app.handle().clone();
    (app, RunContext::new(id.to_string(), handle))
}

#[test]
fn runs_latexmk_and_assembles_a_result() {
    install_stubs();
    let root = make_project("success");

    let (_app, ctx) = context("t1");
    let result = engine::compile(&request_for(&root, CompilerKind::Latexmk), &ctx)
        .expect("compile should succeed");

    // A PDF was produced, but the log carried an error.
    assert_eq!(result.status, CompileStatus::SucceededWithErrors);
    assert_eq!(result.exit_code, Some(0));

    let pdf = result.pdf_path.expect("a pdf path");
    assert!(pdf.ends_with("main.pdf"), "unexpected pdf path: {pdf}");
    assert!(Path::new(&pdf).is_file(), "pdf should exist on disk");
    assert!(
        pdf.contains(engine::BUILD_DIR),
        "pdf should be in the build dir"
    );

    // Diagnostics came from the .log file, not stdout.
    assert_eq!(
        result.error_count, 1,
        "diagnostics: {:?}",
        result.diagnostics
    );
    assert_eq!(result.warning_count, 1);

    let error = result
        .diagnostics
        .iter()
        .find(|d| d.severity == DiagnosticSeverity::Error)
        .expect("an error diagnostic");
    assert_eq!(error.line, Some(12));
    assert_eq!(error.file.as_deref(), Some("main.tex"));

    let warning = result
        .diagnostics
        .iter()
        .find(|d| d.severity == DiagnosticSeverity::Warning)
        .expect("a warning diagnostic");
    assert_eq!(warning.line, Some(42));

    // Streamed stdout was captured, and the environment reached the process.
    assert!(
        result.log.contains("Run number 1"),
        "log was: {}",
        result.log
    );
    assert!(
        result.log.contains("max_print_line=10000"),
        "engine environment was not applied: {}",
        result.log
    );

    // The command line is reported for the terminal panel.
    assert!(result.command.starts_with("latexmk "));
    assert!(result.command.contains("-file-line-error"));
    assert!(result.duration_ms < 60_000);

    fs::remove_dir_all(&root).ok();
}

#[test]
fn missing_main_document_is_reported_clearly() {
    install_stubs();
    let root = make_project("missing-main");
    fs::remove_file(root.join("main.tex")).unwrap();

    let (_app, ctx) = context("t2");
    let error = engine::compile(&request_for(&root, CompilerKind::Latexmk), &ctx)
        .expect_err("should fail when the main document is gone");

    assert_eq!(error.kind, inktex_lib::error::ErrorKind::NotFound);
    assert!(
        error.hint.is_some(),
        "should suggest picking another document"
    );

    fs::remove_dir_all(&root).ok();
}

#[test]
fn a_missing_toolchain_names_the_program() {
    install_stubs();

    // Only meaningful when the machine genuinely lacks XeLaTeX — on a developer
    // box with MacTeX installed there is nothing to assert.
    if inktex_lib::latex::detect::find_binary("xelatex").is_some() {
        return;
    }

    let root = make_project("no-engine");

    // `xelatex` is not among the stubs, so it cannot be found.
    let (_app, ctx) = context("t3");
    let error = engine::compile(&request_for(&root, CompilerKind::Xelatex), &ctx)
        .expect_err("should fail when the engine is absent");

    assert_eq!(error.kind, inktex_lib::error::ErrorKind::TexNotFound);
    assert!(
        error.message.contains("xelatex"),
        "message: {}",
        error.message
    );
    assert!(error.hint.is_some(), "should explain how to install TeX");

    fs::remove_dir_all(&root).ok();
}

#[test]
fn cancel_terminates_a_running_build() {
    install_stubs();
    let root = make_project("cancel");
    // Make the stub block for 30s so there is a real process to kill.
    fs::write(root.join("SLOW"), "").expect("write marker");

    let (_app, ctx) = context("t4");
    let request = request_for(&root, CompilerKind::Latexmk);

    let started = Instant::now();
    let handle = {
        let ctx = ctx.clone();
        std::thread::spawn(move || engine::compile(&request, &ctx))
    };

    // Let the process actually start before signalling it.
    std::thread::sleep(Duration::from_millis(500));
    assert!(!handle.is_finished(), "the stub should still be sleeping");

    ctx.cancel();

    let result = handle.join().expect("worker thread should not panic");
    let elapsed = started.elapsed();

    let error = result.expect_err("a canceled build must not report success");
    assert_eq!(error.kind, inktex_lib::error::ErrorKind::Canceled);

    // The whole point: cancelling returns promptly rather than waiting out the
    // 30-second sleep, which proves the process group was signalled.
    assert!(
        elapsed < Duration::from_secs(10),
        "cancellation did not take effect: {elapsed:?}"
    );

    fs::remove_dir_all(&root).ok();
}
