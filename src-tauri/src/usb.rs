// Direct USB transport for label printers via the kernel usblp char device.
// Linux only; other targets return empty so the UI tab self-hides.

/// One USB printer node for the picker. `id` is stable across replug; the
/// caller round-trips it back to send.
#[derive(serde::Serialize)]
pub struct UsbPrinter {
  pub id: String,        // "vid:pid:serial", fallback sysfs path
  pub name: String,      // "<manufacturer> <product>"
  pub vendor_id: String, // lowercase hex, e.g. "0a5f"
}

#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum UsbSendResult {
  Sent,
  PermissionDenied,
  NotFound,
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub async fn list_usb_printers() -> Result<Vec<UsbPrinter>, String> {
  Ok(Vec::new())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub async fn send_zpl_usb(_device: String, _zpl: String) -> Result<UsbSendResult, String> {
  Err("USB transport is Linux only".to_string())
}

// Linux stubs: real implementation arrives in the next task.
#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn list_usb_printers() -> Result<Vec<UsbPrinter>, String> {
  Ok(Vec::new())
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn send_zpl_usb(_device: String, _zpl: String) -> Result<UsbSendResult, String> {
  Ok(UsbSendResult::NotFound)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn send_result_serializes_with_kind_tag() {
    let json = serde_json::to_string(&UsbSendResult::PermissionDenied).unwrap();
    assert_eq!(json, r#"{"kind":"permission_denied"}"#);
  }
}
