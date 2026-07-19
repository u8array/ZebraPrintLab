mod credentials;
mod mcp;
mod print;
mod transport;
mod usb;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .manage(mcp::McpState::default())
    .invoke_handler(tauri::generate_handler![
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
      credentials::credential_delete,
      mcp::mcp_start,
      mcp::mcp_stop,
      mcp::mcp_status,
      mcp::mcp_listeners_ready
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
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      // Kill the MCP child on exit so it never outlives the app window.
      if let tauri::RunEvent::Exit = event {
        app.state::<mcp::McpState>().kill();
      }
    });
}
