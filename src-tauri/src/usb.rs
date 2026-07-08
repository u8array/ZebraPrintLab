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

#[cfg(target_os = "linux")]
use std::path::Path;

// Reads one sysfs attribute, trimmed. Missing/unreadable becomes None so a
// half-described device is skipped rather than half-parsed.
#[cfg(target_os = "linux")]
fn attr(dir: &Path, name: &str) -> Option<String> {
  std::fs::read_to_string(dir.join(name)).ok().map(|s| s.trim().to_string())
}

#[cfg(target_os = "linux")]
fn parse_printer(usb_dev_dir: &Path) -> Option<UsbPrinter> {
  let vendor_id = attr(usb_dev_dir, "idVendor")?;
  let product_id = attr(usb_dev_dir, "idProduct")?;
  // No serial: fall back to the sysfs path so the id stays unique per port.
  let serial = attr(usb_dev_dir, "serial")
    .unwrap_or_else(|| usb_dev_dir.to_string_lossy().into_owned());
  let manufacturer = attr(usb_dev_dir, "manufacturer").unwrap_or_default();
  let product = attr(usb_dev_dir, "product").unwrap_or_default();
  let name = format!("{manufacturer} {product}").trim().to_string();
  Some(UsbPrinter {
    id: format!("{vendor_id}:{product_id}:{serial}"),
    name,
    vendor_id,
  })
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

  #[cfg(target_os = "linux")]
  #[test]
  fn parses_printer_from_sysfs_dir() {
    use std::fs;
    let dir = std::env::temp_dir().join(format!("zpl_sysfs_{}", std::process::id()));
    let dev = dir.join("1-6");
    fs::create_dir_all(&dev).unwrap();
    for (f, v) in [
      ("idVendor", "0a5f"),
      ("idProduct", "0166"),
      ("serial", "D4J260700032"),
      ("manufacturer", "Zebra Technologies"),
      ("product", "ZTC ZD230-203dpi ZPL"),
    ] {
      fs::write(dev.join(f), format!("{v}\n")).unwrap();
    }
    let p = parse_printer(&dev).unwrap();
    assert_eq!(p.id, "0a5f:0166:D4J260700032");
    assert_eq!(p.vendor_id, "0a5f");
    assert_eq!(p.name, "Zebra Technologies ZTC ZD230-203dpi ZPL");
    fs::remove_dir_all(&dir).ok();
  }
}
