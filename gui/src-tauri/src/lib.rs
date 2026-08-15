/// Croessweave Tauri application entry point.
pub mod commands;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      commands::install_pipeline,
      commands::load_config,
      commands::clean_outputs,
      commands::get_logs,
      commands::read_config_file,
      commands::write_config_file,
      commands::open_config_dir,
      commands::list_aindex_files,
      commands::read_aindex_file,
      commands::write_aindex_file,
      commands::list_category_files,
      commands::get_aindex_stats,
    ])
    .setup(|app| {
      tray::create_tray(app)?;

      let window = app
        .get_webview_window("main")
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
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
    .map_err(|error| eprintln!("error while running tauri application: {error}"))
    .ok();
}
