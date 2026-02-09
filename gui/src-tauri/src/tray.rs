/// System tray integration for the Memory Sync desktop application.
///
/// Creates a tray icon with a context menu containing three actions:
/// - **执行同步** (`execute`): Triggers pipeline execution. Currently shows
///   the main window as a placeholder until full sidecar integration is wired.
/// - **打开主窗口** (`show`): Brings the main window to the foreground.
/// - **退出** (`quit`): Fully exits the application process.
///
/// Left-clicking the tray icon toggles the main window's visibility
/// (show ↔ hide).
///
/// # Requirements
///
/// - 8.1 — Display tray icon on startup
/// - 8.2 — Click tray icon toggles window show/hide
/// - 8.3 — Right-click context menu with execute, show, quit
/// - 8.4 — "执行同步" triggers pipeline execution
/// - 8.6 — "退出" fully exits the application

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// Create and configure the system tray icon with its context menu.
///
/// This function should be called during `App::setup` to register the tray
/// before the event loop starts.
///
/// # Errors
///
/// Returns a [`tauri::Error`] if menu item creation, menu assembly, icon
/// retrieval, or tray builder registration fails.
pub fn create_tray(app: &tauri::App) -> Result<TrayIcon, tauri::Error> {
    // ── Context menu items ──────────────────────────────────────────────
    let execute_item = MenuItem::with_id(app, "execute", "执行同步", true, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&execute_item, &show_item, &quit_item])?;

    // ── Build the tray icon ─────────────────────────────────────────────
    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        // Handle context-menu item clicks.
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "execute" => {
                    // TODO: Trigger pipeline execution via sidecar once the
                    //       full IPC wiring is in place. For now, surface the
                    //       main window so the user can initiate execution
                    //       from the GUI.
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        // Left-click on the tray icon toggles window visibility.
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)
}
