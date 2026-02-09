/// Memory Sync Tauri application entry point.
///
/// Initializes the Tauri app with:
/// - Shell and updater plugins
/// - All Tauri commands (execute_pipeline, load_config, list_plugins, clean_outputs)
/// - System tray with context menu
/// - Window close interception (minimize to tray instead of exiting)
///
/// # Requirements
///
/// - 8.5 — Closing the main window minimizes to system tray instead of exiting

mod commands;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::execute_pipeline,
            commands::load_config,
            commands::list_plugins,
            commands::clean_outputs,
            commands::get_logs,
        ])
        .setup(|app| {
            // Create the system tray icon and context menu.
            tray::create_tray(app)?;

            // Intercept the window close event: hide the window instead of
            // closing it so the application stays resident in the system tray.
            let window = app.get_webview_window("main").unwrap();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_clone.hide();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
