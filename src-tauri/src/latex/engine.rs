//! Driving the TeX toolchain.
//!
//! Two execution strategies are supported:
//!
//! * **latexmk** — the preferred path. latexmk already knows how many passes a
//!   document needs and when to invoke BibTeX/Biber, so we hand it the job.
//! * **A direct engine** (`pdflatex`/`xelatex`/`lualatex`) — we implement the
//!   pass scheduling ourselves: an initial pass, a bibliography pass when the
//!   document cites anything, then reruns until cross-references settle.
//!
//! Output from every process is streamed to the frontend line-by-line as it is
//! produced, so the log panel fills in live rather than appearing at the end.

use crate::error::{AppError, AppResult, ErrorKind};
use crate::latex::{detect, log_parser};
use crate::models::{
    BibEngine, CompileOutputEvent, CompileRequest, CompileResult, CompileStatus, CompilerKind,
    DiagnosticSeverity,
};
use crate::paths;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Runtime};

/// Directory used for auxiliary output when the project opts into one.
pub const BUILD_DIR: &str = ".inktex-build";

/// Auxiliary file extensions removed by "clean auxiliary files".
pub const AUX_EXTENSIONS: &[&str] = &[
    "aux",
    "bbl",
    "bcf",
    "blg",
    "brf",
    "fdb_latexmk",
    "fls",
    "glg",
    "glo",
    "gls",
    "idx",
    "ilg",
    "ind",
    "ist",
    "lof",
    "log",
    "lot",
    "nav",
    "out",
    "snm",
    "spl",
    "synctex",
    "synctex.gz",
    "toc",
    "vrb",
    "xdv",
    "dvi",
    "run.xml",
    "acn",
    "acr",
    "alg",
    "loa",
    "thm",
    "pyg",
];

/// Maximum engine passes in the direct-engine driver.
const MAX_PASSES: usize = 5;

/// Shared cancellation channel for the in-flight build.
///
/// Generic over the Tauri runtime — it defaults to `Wry`, which is what the
/// commands use, while tests can substitute the mock runtime.
pub struct RunContext<R: Runtime = tauri::Wry> {
    pub id: String,
    app: AppHandle<R>,
    canceled: Arc<AtomicBool>,
    /// PID of the process currently running, so cancel can signal it.
    current_pid: Arc<Mutex<Option<u32>>>,
}

// Implemented by hand rather than derived: `#[derive(Clone)]` would add an
// `R: Clone` bound, which runtime types do not satisfy.
impl<R: Runtime> Clone for RunContext<R> {
    fn clone(&self) -> Self {
        Self {
            id: self.id.clone(),
            app: self.app.clone(),
            canceled: Arc::clone(&self.canceled),
            current_pid: Arc::clone(&self.current_pid),
        }
    }
}

impl<R: Runtime> RunContext<R> {
    pub fn new(id: String, app: AppHandle<R>) -> Self {
        Self {
            id,
            app,
            canceled: Arc::new(AtomicBool::new(false)),
            current_pid: Arc::new(Mutex::new(None)),
        }
    }

    pub fn is_canceled(&self) -> bool {
        self.canceled.load(Ordering::SeqCst)
    }

    /// Mark the run as canceled and terminate whatever process is running.
    pub fn cancel(&self) {
        self.canceled.store(true, Ordering::SeqCst);
        if let Some(pid) = *self.current_pid.lock().expect("pid lock") {
            terminate_process_tree(pid);
        }
    }

    fn set_pid(&self, pid: Option<u32>) {
        *self.current_pid.lock().expect("pid lock") = pid;
    }

    fn emit_line(&self, line: &str) {
        // A failed emit means the window is gone; the build will be discarded
        // anyway, so there is nothing useful to do with the error.
        let _ = self.app.emit(
            "compile://output",
            CompileOutputEvent {
                id: self.id.clone(),
                line: line.to_string(),
            },
        );
    }
}

/// Kill a process and, on Unix, everything in its process group.
///
/// latexmk spawns the engine as a child; signalling only latexmk would leave a
/// pdflatex process writing into the build directory after "cancel".
fn terminate_process_tree(pid: u32) {
    #[cfg(unix)]
    {
        // Negative PID targets the whole process group (see `process_group(0)`
        // in `spawn_process`). SIGTERM first so latexmk can clean up.
        unsafe {
            libc::kill(-(pid as i32), libc::SIGTERM);
        }
        std::thread::sleep(std::time::Duration::from_millis(120));
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }

    #[cfg(windows)]
    {
        // /T terminates the tree, /F forces it.
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

/// One process invocation and everything captured from it.
struct ProcessOutcome {
    exit_code: Option<i32>,
    output: String,
}

/// Absolute path of the directory auxiliary output is written to.
fn output_directory(root: &Path, request: &CompileRequest) -> PathBuf {
    if request.use_output_directory {
        root.join(BUILD_DIR)
    } else {
        root.to_path_buf()
    }
}

/// TeX jobname — the main document's stem.
fn job_name(main: &Path) -> String {
    main.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "document".into())
}

/// Apply the environment every TeX process needs.
///
/// * `PATH` is the augmented search path (see [`detect::search_path`]).
/// * `max_print_line` stops the engine hard-wrapping log lines at 79 columns,
///   which would otherwise split messages mid-word and defeat the log parser.
/// * `TEXINPUTS`/`BIBINPUTS` include the project tree recursively so `\input`
///   and `\bibliography` resolve for nested sources.
fn apply_environment(cmd: &mut Command, root: &Path) {
    let root_str = root.to_string_lossy();
    let separator = if cfg!(windows) { ";" } else { ":" };
    // A trailing empty entry means "then the default search path".
    let recursive = format!("{root_str}{separator}{root_str}//{separator}");

    cmd.env("PATH", detect::search_path())
        .env("max_print_line", "10000")
        .env("error_line", "254")
        .env("half_error_line", "238")
        .env("TEXINPUTS", &recursive)
        .env("BIBINPUTS", &recursive)
        .env("BSTINPUTS", &recursive)
        .env("TEXMFOUTPUT", root.as_os_str());
}

/// Spawn a process in its own group so the whole tree can be signalled.
fn spawn_process(cmd: &mut Command) -> std::io::Result<Child> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Group id 0 means "use the new child's PID as the group id".
        cmd.process_group(0);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    }

    cmd.spawn()
}

/// Read a pipe line-by-line, forwarding each line to the frontend and
/// accumulating it into `sink`.
fn pump<Rd: Read + Send + 'static, R: Runtime>(
    reader: Rd,
    context: RunContext<R>,
    sink: Arc<Mutex<String>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffered = BufReader::new(reader);
        let mut raw: Vec<u8> = Vec::with_capacity(256);

        loop {
            raw.clear();
            // Read bytes rather than a String: TeX logs frequently contain
            // non-UTF-8 sequences from fonts and legacy encodings.
            match buffered.read_until(b'\n', &mut raw) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&raw);
                    let line = line.trim_end_matches(['\n', '\r']);
                    context.emit_line(line);
                    if let Ok(mut guard) = sink.lock() {
                        guard.push_str(line);
                        guard.push('\n');
                    }
                }
            }
        }
    })
}

/// Run one process to completion, streaming its output.
fn run_process<R: Runtime>(
    program: &str,
    args: &[String],
    working_dir: &Path,
    root: &Path,
    context: &RunContext<R>,
) -> AppResult<ProcessOutcome> {
    if context.is_canceled() {
        return Err(AppError::new(ErrorKind::Canceled, "Compilation canceled."));
    }

    let resolved = detect::find_binary(program).ok_or_else(|| missing_tool_error(program))?;

    let mut cmd = Command::new(&resolved);
    cmd.args(args)
        .current_dir(working_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_environment(&mut cmd, root);

    let mut child = spawn_process(&mut cmd).map_err(|e| {
        AppError::new(
            ErrorKind::CompilerFailed,
            format!("Could not start {program}: {e}"),
        )
    })?;

    context.set_pid(Some(child.id()));

    let sink = Arc::new(Mutex::new(String::new()));
    let stdout_pump = child
        .stdout
        .take()
        .map(|out| pump(out, context.clone(), Arc::clone(&sink)));
    let stderr_pump = child
        .stderr
        .take()
        .map(|err| pump(err, context.clone(), Arc::clone(&sink)));

    let status = child.wait();

    // Pumps end when their pipes close, which happens on process exit.
    if let Some(handle) = stdout_pump {
        let _ = handle.join();
    }
    if let Some(handle) = stderr_pump {
        let _ = handle.join();
    }
    context.set_pid(None);

    let output = sink.lock().map(|g| g.clone()).unwrap_or_default();

    if context.is_canceled() {
        return Err(AppError::new(ErrorKind::Canceled, "Compilation canceled."));
    }

    let status = status.map_err(|e| {
        AppError::new(
            ErrorKind::CompilerFailed,
            format!("{program} did not run to completion: {e}"),
        )
    })?;

    Ok(ProcessOutcome {
        exit_code: status.code(),
        output,
    })
}

/// Error describing a missing part of the toolchain, with install guidance.
fn missing_tool_error(program: &str) -> AppError {
    let hint = if cfg!(target_os = "macos") {
        "Install MacTeX from https://tug.org/mactex/ (or `brew install --cask mactex-no-gui`). \
         If it is already installed, ensure /Library/TeX/texbin exists."
    } else if cfg!(target_os = "windows") {
        "Install MiKTeX from https://miktex.org/ or TeX Live from https://tug.org/texlive/."
    } else {
        "Install TeX Live — for example `sudo apt install texlive-full latexmk`."
    };

    AppError::new(
        ErrorKind::TexNotFound,
        format!("“{program}” was not found on this system."),
    )
    .with_hint(hint)
}

/// Assemble the latexmk command line for a request.
fn latexmk_args(request: &CompileRequest, main_relative: &str, out_dir: &Path) -> Vec<String> {
    // latexmk does not halt on the first error by default, which is what we
    // want: one mistake should not hide the rest of the document's problems.
    let mut args = vec![
        request.latexmk_engine.flag().to_string(),
        "-interaction=nonstopmode".into(),
        "-file-line-error".into(),
    ];

    if request.synctex {
        args.push("-synctex=1".into());
    }
    if request.force {
        // -g forces a rebuild even if latexmk thinks everything is current.
        args.push("-g".into());
    }

    match request.bib_engine {
        // latexmk picks biber automatically when it sees a .bcf file.
        BibEngine::Auto | BibEngine::Bibtex | BibEngine::Biber => args.push("-bibtex".into()),
        BibEngine::None => args.push("-bibtex-".into()),
    }

    args.push(format!("-outdir={}", out_dir.display()));
    args.extend(request.extra_args.iter().cloned());
    args.push(main_relative.to_string());
    args
}

/// Assemble a direct engine command line.
fn engine_args(request: &CompileRequest, main_relative: &str, out_dir: &Path) -> Vec<String> {
    let mut args = vec!["-interaction=nonstopmode".into(), "-file-line-error".into()];
    if request.synctex {
        args.push("-synctex=1".into());
    }
    if request.use_output_directory {
        args.push(format!("-output-directory={}", out_dir.display()));
    }
    args.extend(request.extra_args.iter().cloned());
    args.push(main_relative.to_string());
    args
}

/// Does the document cite anything, and if so which backend should process it?
fn needs_bibliography(out_dir: &Path, job: &str, requested: BibEngine) -> Option<&'static str> {
    if matches!(requested, BibEngine::None) {
        return None;
    }

    // biblatex writes a .bcf control file; that is the definitive biber signal.
    let bcf = out_dir.join(format!("{job}.bcf"));
    if bcf.exists() {
        return match requested {
            BibEngine::Bibtex => Some("bibtex"),
            _ => Some("biber"),
        };
    }

    // Classic BibTeX: the .aux file records \citation entries.
    let aux = out_dir.join(format!("{job}.aux"));
    let Ok(contents) = std::fs::read_to_string(&aux) else {
        return None;
    };
    if contents.contains("\\citation") && contents.contains("\\bibdata") {
        return match requested {
            BibEngine::Biber => Some("biber"),
            _ => Some("bibtex"),
        };
    }
    None
}

/// Whether the engine asked to be run again to settle references.
fn wants_rerun(log: &str) -> bool {
    log.contains("Rerun to get")
        || log.contains("Label(s) may have changed")
        || log.contains("Please rerun LaTeX")
        || log.contains("Rerun LaTeX")
        || log.contains("Package rerunfilecheck Warning")
}

/// Execute a full build and produce a [`CompileResult`].
pub fn compile<R: Runtime>(
    request: &CompileRequest,
    context: &RunContext<R>,
) -> AppResult<CompileResult> {
    let started = Instant::now();
    let root = PathBuf::from(&request.root);

    if !root.is_dir() {
        return Err(AppError::invalid_project(format!(
            "The project folder “{}” no longer exists.",
            root.display()
        )));
    }

    let main_absolute = paths::resolve_within(&root, Path::new(&request.main_document))?;
    if !main_absolute.is_file() {
        return Err(
            AppError::not_found(format!("The main document “{}”", request.main_document))
                .with_hint("Pick a different main document from the file explorer."),
        );
    }

    let out_dir = output_directory(&root, request);
    if request.use_output_directory {
        std::fs::create_dir_all(&out_dir).map_err(|e| AppError::from_io(&e, &out_dir))?;
    }

    let job = job_name(&main_absolute);
    let main_relative = paths::relative_to(&root, &main_absolute);

    let mut full_log = String::new();
    // Both branches below assign these before anything reads them.
    let mut last_exit: Option<i32>;
    let command_line: String;

    match request.compiler {
        CompilerKind::Latexmk => {
            let args = latexmk_args(request, &main_relative, &out_dir);
            command_line = format!("latexmk {}", shell_join(&args));
            let outcome = run_process("latexmk", &args, &root, &root, context)?;
            full_log.push_str(&outcome.output);
            last_exit = outcome.exit_code;
        }

        kind => {
            // Direct-engine driver: schedule the passes ourselves.
            let program = kind.program();
            let args = engine_args(request, &main_relative, &out_dir);
            command_line = format!("{program} {}", shell_join(&args));

            let first = run_process(program, &args, &root, &root, context)?;
            full_log.push_str(&first.output);
            last_exit = first.exit_code;

            if let Some(bib_tool) = needs_bibliography(&out_dir, &job, request.bib_engine) {
                // Run the bibliography tool with the output directory as its
                // working directory: the .aux/.bcf live there, and BIBINPUTS
                // (set in `apply_environment`) points back at the sources.
                let bib_args = vec![job.clone()];
                match run_process(bib_tool, &bib_args, &out_dir, &root, context) {
                    Ok(outcome) => {
                        full_log.push_str(&outcome.output);
                    }
                    Err(err) if err.kind == ErrorKind::Canceled => return Err(err),
                    Err(err) => {
                        // A missing biber should not abort the whole build; the
                        // document still typesets, just without a bibliography.
                        full_log.push_str(&format!("\nInkTex: {}\n", err.message));
                    }
                }

                let second = run_process(program, &args, &root, &root, context)?;
                full_log.push_str(&second.output);
                last_exit = second.exit_code;
            }

            // Rerun until cross-references stop changing.
            let mut pass = 2;
            while pass < MAX_PASSES && wants_rerun(&full_log) {
                let outcome = run_process(program, &args, &root, &root, context)?;
                let settled = !wants_rerun(&outcome.output);
                full_log.push_str(&outcome.output);
                last_exit = outcome.exit_code;
                pass += 1;
                if settled {
                    break;
                }
            }
        }
    }

    // The .log file is more complete than stdout (latexmk filters some lines),
    // so prefer it for diagnostics when it exists.
    let log_file = out_dir.join(format!("{job}.log"));
    let parse_source = std::fs::read(&log_file)
        .ok()
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        .unwrap_or_else(|| full_log.clone());

    let diagnostics = log_parser::parse(&parse_source, &root);
    let error_count = diagnostics
        .iter()
        .filter(|d| d.severity == DiagnosticSeverity::Error)
        .count();
    let warning_count = diagnostics
        .iter()
        .filter(|d| d.severity == DiagnosticSeverity::Warning)
        .count();

    let pdf_path = out_dir.join(format!("{job}.pdf"));
    let pdf_exists = pdf_path.is_file();

    let status = if !pdf_exists || log_parser::is_fatal(&parse_source) {
        CompileStatus::Failed
    } else if error_count > 0 || last_exit.unwrap_or(0) != 0 {
        CompileStatus::SucceededWithErrors
    } else {
        CompileStatus::Success
    };

    Ok(CompileResult {
        id: context.id.clone(),
        status,
        exit_code: last_exit,
        pdf_path: pdf_exists.then(|| pdf_path.to_string_lossy().into_owned()),
        duration_ms: started.elapsed().as_millis() as u64,
        diagnostics,
        log: full_log,
        command: command_line,
        error_count,
        warning_count,
        finished_at: epoch_millis(),
    })
}

/// Delete auxiliary files produced by previous builds.
///
/// Returns the project-relative paths that were removed.
pub fn clean_auxiliary(root: &Path, use_output_directory: bool) -> AppResult<Vec<String>> {
    let mut removed = Vec::new();

    if use_output_directory {
        let build = root.join(BUILD_DIR);
        if build.is_dir() {
            for entry in std::fs::read_dir(&build).map_err(|e| AppError::from_io(&e, &build))? {
                let Ok(entry) = entry else { continue };
                let path = entry.path();
                // Keep the PDF so the preview does not blank out.
                if paths::extension_of(&path) == "pdf" {
                    continue;
                }
                let ok = if path.is_dir() {
                    std::fs::remove_dir_all(&path).is_ok()
                } else {
                    std::fs::remove_file(&path).is_ok()
                };
                if ok {
                    removed.push(paths::relative_to(root, &path));
                }
            }
        }
        return Ok(removed);
    }

    // In-place builds: walk the tree and remove known auxiliary extensions.
    for entry in walkdir::WalkDir::new(root)
        .max_depth(8)
        .into_iter()
        .filter_entry(|e| !is_hidden(e.file_name().to_string_lossy().as_ref()))
        .flatten()
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();

        let matches_aux = AUX_EXTENSIONS
            .iter()
            .any(|ext| name.ends_with(&format!(".{ext}")));

        if matches_aux && std::fs::remove_file(path).is_ok() {
            removed.push(paths::relative_to(root, path));
        }
    }

    Ok(removed)
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.') && name != "." && name != BUILD_DIR
}

/// Render an argument list the way a shell would display it.
fn shell_join(args: &[String]) -> String {
    args.iter()
        .map(|a| {
            if a.contains(' ') || a.contains('"') {
                format!("{a:?}")
            } else {
                a.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{BibEngine, CompilerKind, LatexmkEngine};

    fn request() -> CompileRequest {
        CompileRequest {
            root: "/tmp/project".into(),
            main_document: "main.tex".into(),
            compiler: CompilerKind::Latexmk,
            latexmk_engine: LatexmkEngine::Pdflatex,
            bib_engine: BibEngine::Auto,
            use_output_directory: true,
            synctex: true,
            force: false,
            extra_args: vec![],
        }
    }

    #[test]
    fn latexmk_args_select_engine_and_outdir() {
        let req = request();
        let args = latexmk_args(&req, "main.tex", Path::new("/tmp/project/.inktex-build"));
        assert!(args.contains(&"-pdf".to_string()));
        assert!(args.contains(&"-file-line-error".to_string()));
        assert!(args.iter().any(|a| a.starts_with("-outdir=")));
        assert_eq!(args.last().unwrap(), "main.tex");
    }

    #[test]
    fn xelatex_uses_pdfxe_flag() {
        let mut req = request();
        req.latexmk_engine = LatexmkEngine::Xelatex;
        let args = latexmk_args(&req, "main.tex", Path::new("/out"));
        assert!(args.contains(&"-pdfxe".to_string()));
    }

    #[test]
    fn bib_can_be_disabled() {
        let mut req = request();
        req.bib_engine = BibEngine::None;
        let args = latexmk_args(&req, "main.tex", Path::new("/out"));
        assert!(args.contains(&"-bibtex-".to_string()));
    }

    #[test]
    fn direct_engine_omits_outdir_when_building_in_place() {
        let mut req = request();
        req.use_output_directory = false;
        let args = engine_args(&req, "main.tex", Path::new("/out"));
        assert!(!args.iter().any(|a| a.starts_with("-output-directory")));
    }

    #[test]
    fn rerun_detection_matches_latex_phrasing() {
        assert!(wants_rerun("LaTeX Warning: Label(s) may have changed."));
        assert!(wants_rerun("Rerun to get cross-references right."));
        assert!(!wants_rerun("Output written on main.pdf"));
    }

    #[test]
    fn job_name_uses_file_stem() {
        assert_eq!(job_name(Path::new("/a/b/thesis.tex")), "thesis");
    }

    #[test]
    fn shell_join_quotes_spaces() {
        let args = vec!["-outdir=/a b".to_string(), "main.tex".to_string()];
        assert!(shell_join(&args).contains('"'));
    }
}
