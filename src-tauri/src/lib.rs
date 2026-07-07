#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();
  // On the builder, not in setup(): config windows exist before the setup
  // closure runs, and window-state only restores/tracks via on_window_ready.
  #[cfg(desktop)]
  let builder = builder
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init());
  builder
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
