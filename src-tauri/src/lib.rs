mod credentials;
mod print;
mod transport;
mod usb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default().invoke_handler(tauri::generate_handler![
    print::send_zpl_tcp,
    print::query_zpl_tcp,
    print::list_printers,
    print::send_zpl_local,
    usb::list_usb_printers,
    usb::send_zpl_usb,
    usb::query_zpl_usb,
    usb::setup_usb_access,
    credentials::credential_get,
    credentials::credential_set,
    credentials::credential_delete
  ]);
  // On the builder, not in setup(): config windows exist before the setup
  // closure runs, and window-state only restores/tracks via on_window_ready.
  #[cfg(desktop)]
  let builder = builder
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init());
  builder
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
