//! Compilation commands.

use crate::error::{AppError, AppResult, ErrorKind};
use crate::latex::detect;
use crate::latex::engine::{self, RunContext};
use crate::models::{
    CompileRequest, CompileResult, CompileStartedEvent, CompileStatus, TexEnvironment,
};
use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager, State};

/// Probe for a usable TeX installation.
///
/// Called at startup and whenever the user retries after installing TeX, so it
/// deliberately re-probes rather than caching the *result* (the search path
/// itself is cached, since installation prefixes do not move).
#[tauri::command]
pub async fn get_tex_environment() -> AppResult<TexEnvironment> {
    // Probing runs several `--version` subprocesses; keep them off the main
    // thread so the UI stays responsive during startup.
    tauri::async_runtime::spawn_blocking(detect::detect_environment)
        .await
        .map_err(|e| AppError::internal(format!("TeX detection failed: {e}")))
}

/// Run a build.
///
/// Only one build may run at a time; a second call while one is in flight is
/// rejected with [`ErrorKind::CompileBusy`] rather than queued, so the UI can
/// tell the user plainly instead of silently stacking work.
#[tauri::command]
pub async fn compile_project(app: AppHandle, request: CompileRequest) -> AppResult<CompileResult> {
    let id = format!("compile-{}", engine::epoch_millis());
    let context = RunContext::new(id.clone(), app.clone());

    {
        let state = app.state::<AppState>();
        state.compile.begin(context.clone())?;
    }

    let _ = app.emit(
        "compile://started",
        CompileStartedEvent {
            id: id.clone(),
            command: format!("{} {}", request.compiler.program(), request.main_document),
            started_at: engine::epoch_millis(),
        },
    );

    // The build blocks on subprocesses; run it on the blocking pool.
    let outcome = {
        let context = context.clone();
        tauri::async_runtime::spawn_blocking(move || engine::compile(&request, &context)).await
    };

    // Release the slot no matter how the build ended, including a panic in the
    // worker — otherwise the app would refuse every future compile.
    app.state::<AppState>().compile.finish();

    let result = match outcome {
        Ok(Ok(result)) => result,
        Ok(Err(err)) if err.kind == ErrorKind::Canceled => CompileResult {
            id,
            status: CompileStatus::Canceled,
            exit_code: None,
            pdf_path: None,
            duration_ms: 0,
            diagnostics: Vec::new(),
            log: "Compilation canceled.".into(),
            command: String::new(),
            error_count: 0,
            warning_count: 0,
            finished_at: engine::epoch_millis(),
        },
        Ok(Err(err)) => return Err(err),
        Err(err) => {
            return Err(AppError::new(
                ErrorKind::CompilerFailed,
                format!("The compiler task ended unexpectedly: {err}"),
            ))
        }
    };

    let _ = app.emit("compile://finished", &result);
    Ok(result)
}

/// Stop the running build. Returns false when nothing was running.
#[tauri::command]
pub fn cancel_compile(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(state.compile.cancel())
}

#[tauri::command]
pub fn is_compiling(state: State<'_, AppState>) -> bool {
    state.compile.is_running()
}

/// Delete auxiliary build artefacts. Returns the removed project-relative paths.
#[tauri::command]
pub fn clean_auxiliary_files(
    state: State<'_, AppState>,
    use_output_directory: bool,
) -> AppResult<Vec<String>> {
    let root = state.project.require()?;

    if state.compile.is_running() {
        return Err(AppError::new(
            ErrorKind::CompileBusy,
            "Cannot clean while a compilation is running.",
        )
        .with_hint("Wait for the build to finish, or cancel it."));
    }

    engine::clean_auxiliary(&root, use_output_directory)
}

/// Absolute path of the build directory for the open project.
#[tauri::command]
pub fn get_output_directory(
    state: State<'_, AppState>,
    use_output_directory: bool,
) -> AppResult<String> {
    let root = state.project.require()?;
    let directory = if use_output_directory {
        root.join(engine::BUILD_DIR)
    } else {
        root
    };
    Ok(directory.to_string_lossy().into_owned())
}
