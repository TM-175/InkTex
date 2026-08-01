//! Tauri command handlers — the entire surface the frontend can call.
//!
//! Handlers stay thin: they validate and scope their arguments, then delegate
//! to the modules that hold the real logic (`latex`, `tree`, `store`).

pub mod compile;
pub mod fs_ops;
pub mod project;
pub mod settings;
pub mod system;
