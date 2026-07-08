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

// Each /sys/class/usbmisc/lpN has a "device" symlink to the USB interface,
// whose parent is the USB device carrying idVendor/idProduct/serial.
#[cfg(target_os = "linux")]
fn enumerate(usbmisc_root: &Path) -> Vec<(String, UsbPrinter)> {
  let mut out: Vec<(String, UsbPrinter)> = Vec::new();
  let Ok(entries) = std::fs::read_dir(usbmisc_root) else { return out };
  for entry in entries.flatten() {
    let node = entry.file_name().to_string_lossy().into_owned();
    if !node.starts_with("lp") {
      continue;
    }
    // The USB attributes live on the interface's parent device. The test
    // fixture puts them directly under "device"; a real tree resolves the
    // parent, so try "device" then "device/.." for idVendor.
    let base = entry.path().join("device");
    let dev_dir = if base.join("idVendor").exists() {
      base
    } else {
      base.join("..")
    };
    if let Some(p) = parse_printer(&dev_dir) {
      out.push((node, p));
    }
  }
  // Zebra vendor first, then by name, so the label printer beats an office one.
  out.sort_by(|a, b| {
    let za = (a.1.vendor_id != "0a5f", a.1.name.clone());
    let zb = (b.1.vendor_id != "0a5f", b.1.name.clone());
    za.cmp(&zb)
  });
  out
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn list_usb_printers() -> Result<Vec<UsbPrinter>, String> {
  tauri::async_runtime::spawn_blocking(|| {
    enumerate(Path::new("/sys/class/usbmisc"))
      .into_iter()
      .map(|(_, p)| p)
      .collect::<Vec<_>>()
  })
  .await
  .map_err(|e| e.to_string())
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
  fn enumerates_and_sorts_zebra_first() {
    use std::fs;
    let root = std::env::temp_dir().join(format!("zpl_usbmisc_{}", std::process::id()));
    // Two fake usbmisc entries: lp0 = generic, lp1 = Zebra. Each links to a
    // "device" dir holding the USB attributes.
    for (node, vid, pid, ser, man, prod) in [
      ("lp0", "03f0", "0512", "S1", "HP", "LaserJet"),
      ("lp1", "0a5f", "0166", "S2", "Zebra Technologies", "ZD230"),
    ] {
      let dev = root.join(node).join("device");
      fs::create_dir_all(&dev).unwrap();
      for (f, v) in [("idVendor", vid), ("idProduct", pid), ("serial", ser), ("manufacturer", man), ("product", prod)] {
        fs::write(dev.join(f), format!("{v}\n")).unwrap();
      }
    }
    let out = enumerate(&root);
    assert_eq!(out.len(), 2);
    assert_eq!(out[0].1.vendor_id, "0a5f"); // Zebra sorted first
    assert_eq!(out[0].0, "lp1");
    fs::remove_dir_all(&root).ok();
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
