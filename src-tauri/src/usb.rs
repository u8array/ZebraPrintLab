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

#[derive(Debug, serde::Serialize)]
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

#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub async fn setup_usb_access() -> Result<(), String> {
  Err("USB setup is Linux only".to_string())
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
    // Attributes sit on the interface's parent device; fixtures flatten them
    // under "device", so probe there first, then the parent.
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
const MAX_ZPL_BYTES: usize = 16 * 1024 * 1024;

// Map the stable id back to the current char device. lpN numbering can change
// across replug, so it is resolved fresh here, never trusted from the caller.
#[cfg(target_os = "linux")]
fn resolve_node(usbmisc_root: &Path, dev_root: &Path, id: &str) -> Result<std::path::PathBuf, UsbSendResult> {
  let node = enumerate(usbmisc_root)
    .into_iter()
    .find(|(_, p)| p.id == id)
    .map(|(node, _)| node)
    .ok_or(UsbSendResult::NotFound)?;
  Ok(dev_root.join(node))
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn send_zpl_usb(device: String, zpl: String) -> Result<UsbSendResult, String> {
  if zpl.len() > MAX_ZPL_BYTES {
    return Err("payload too large".to_string());
  }
  tauri::async_runtime::spawn_blocking(move || {
    let path = match resolve_node(Path::new("/sys/class/usbmisc"), Path::new("/dev/usb"), &device) {
      Ok(p) => p,
      Err(r) => return Ok(r),
    };
    use std::io::Write;
    match std::fs::OpenOptions::new().write(true).open(&path) {
      Ok(mut f) => match f.write_all(zpl.as_bytes()) {
        Ok(()) => Ok(UsbSendResult::Sent),
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => Ok(UsbSendResult::PermissionDenied),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(UsbSendResult::NotFound),
        Err(e) => Err(e.to_string()),
      },
      Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => Ok(UsbSendResult::PermissionDenied),
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(UsbSendResult::NotFound),
      Err(e) => Err(e.to_string()),
    }
  })
  .await
  .map_err(|e| e.to_string())?
}

// One source of truth for the rule text: the packaged file is embedded so the
// pkexec path and the package payload never drift.
#[cfg(target_os = "linux")]
const UDEV_RULE: &str = include_str!("../packaging/udev/99-zebraprintlab.rules");

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn setup_usb_access() -> Result<(), String> {
  // pkexec shows one polkit prompt, writes the rule, reloads udev. Used by
  // AppImage (no installer) and as a repair path if the packaged rule is gone.
  let script = format!(
    "install -Dm644 /dev/stdin /usr/lib/udev/rules.d/99-zebraprintlab.rules <<'ZEBRA_UDEV_RULE_EOF'\n{UDEV_RULE}\nZEBRA_UDEV_RULE_EOF\nudevadm control --reload-rules && udevadm trigger --subsystem-match=usbmisc --subsystem-match=usb"
  );
  tauri::async_runtime::spawn_blocking(move || {
    let status = std::process::Command::new("pkexec")
      .args(["sh", "-c", &script])
      .status()
      .map_err(|e| e.to_string())?;
    if status.success() {
      Ok(())
    } else {
      match status.code() {
        // pkexec: 126 = auth dialog dismissed, 127 = not authorized.
        Some(126) | Some(127) => Err("setup cancelled".to_string()),
        _ => Err("setup failed".to_string()),
      }
    }
  })
  .await
  .map_err(|e| e.to_string())?
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
  fn resolve_node_maps_missing_device_to_not_found() {
    use std::fs;
    let root = std::env::temp_dir().join(format!("zpl_resolve_{}", std::process::id()));
    let dev = root.join("lp0").join("device");
    fs::create_dir_all(&dev).unwrap();
    for (f, v) in [("idVendor", "0a5f"), ("idProduct", "0166"), ("serial", "S2")] {
      fs::write(dev.join(f), format!("{v}\n")).unwrap();
    }
    let dev_root = root.join("dev");
    fs::create_dir_all(&dev_root).unwrap();
    // Matching id resolves to /dev/usb/lp0 under our fake dev_root.
    let ok = resolve_node(&root, &dev_root, "0a5f:0166:S2").unwrap();
    assert_eq!(ok, dev_root.join("lp0"));
    // Unknown id is NotFound.
    let miss = resolve_node(&root, &dev_root, "dead:beef:X").unwrap_err();
    assert!(matches!(miss, UsbSendResult::NotFound));
    fs::remove_dir_all(&root).ok();
  }

  #[cfg(target_os = "linux")]
  #[test]
  fn enumerates_via_device_parent_and_serialless_id() {
    use std::fs;
    let root = std::env::temp_dir().join(format!("zpl_parent_{}", std::process::id()));
    // Real sysfs: lpN/device is the interface (no idVendor); the USB device
    // one level up (device/..) carries the attributes. Also omit serial.
    let node = root.join("lp0");
    fs::create_dir_all(node.join("device")).unwrap();
    for (f, v) in [("idVendor", "0a5f"), ("idProduct", "0166"), ("manufacturer", "Zebra Technologies"), ("product", "ZD230")] {
      fs::write(node.join(f), format!("{v}\n")).unwrap();
    }
    let out = enumerate(&root);
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].1.vendor_id, "0a5f");
    // No serial: id falls back to the sysfs device path (the device/.. dir).
    assert!(out[0].1.id.starts_with("0a5f:0166:"));
    assert!(out[0].1.id.contains("lp0"));
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
