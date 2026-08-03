//! Window adjustments that only the host toolkit can make.

/// Hide the native window title text on macOS.
///
/// The `Overlay` title-bar style makes the title bar transparent and lets the
/// webview extend underneath it — but it does not hide the title, so AppKit
/// keeps drawing "InkTex" across the top of the window, on top of the compile
/// controls in our own header.
///
/// Hiding just the text is better than clearing the title: the window keeps its
/// name in the Window menu, Mission Control and the app switcher.
#[cfg(target_os = "macos")]
pub fn hide_native_title<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    /// `NSWindowTitleVisibilityHidden`.
    const HIDDEN: isize = 1;

    let Ok(handle) = window.ns_window() else {
        return;
    };
    if handle.is_null() {
        return;
    }

    // SAFETY: `ns_window` hands back the window's `NSWindow`, which responds to
    // `setTitleVisibility:`. Tauri creates and owns it on the main thread, and
    // this is only ever called from there (app setup and command handlers).
    unsafe {
        let ns_window = handle as *mut AnyObject;
        let _: () = msg_send![ns_window, setTitleVisibility: HIDDEN];
    }
}

#[cfg(not(target_os = "macos"))]
pub fn hide_native_title<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>) {}
