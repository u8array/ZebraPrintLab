use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::time::timeout;

/// Kinds mirror the frontend NetworkPrintResult union. `unreachable` (not the
/// browser's ambiguous `no_response`) says the send did not complete, so the UI
/// maps each kind to a message without knowing which transport ran.
#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TcpSendResult {
  Sent,
  Refused,
  Unreachable,
}

const IO_TIMEOUT: Duration = Duration::from_secs(4);
// The webview is untrusted input; bound the payload well above any real batch.
pub(crate) const MAX_ZPL_BYTES: usize = 16 * 1024 * 1024;

fn validate(host: &str, port: u16, zpl_len: usize) -> Result<(), String> {
  if host.is_empty() || host.contains('/') || host.contains(char::is_whitespace) {
    return Err("invalid host".to_string());
  }
  if port == 0 {
    return Err("invalid port".to_string());
  }
  if zpl_len > MAX_ZPL_BYTES {
    return Err("payload too large".to_string());
  }
  Ok(())
}

#[tauri::command]
pub async fn send_zpl_tcp(host: String, port: u16, zpl: String) -> Result<TcpSendResult, String> {
  let host = host.trim();
  validate(host, port, zpl.len())?;

  let mut stream = match timeout(IO_TIMEOUT, TcpStream::connect((host, port))).await {
    Ok(Ok(s)) => s,
    Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionRefused => {
      return Ok(TcpSendResult::Refused)
    }
    // Timeout, no route, unresolvable host: the printer can't be reached.
    Err(_) | Ok(Err(_)) => return Ok(TcpSendResult::Unreachable),
  };

  // Dropping the stream closes it (FIN), which the printer reads as job end;
  // no explicit shutdown, so a printer that RSTs after reading can't fail the
  // send. The write phase is reached, so its failures are not "unreachable".
  match timeout(IO_TIMEOUT, stream.write_all(zpl.as_bytes())).await {
    Ok(Ok(())) => Ok(TcpSendResult::Sent),
    Ok(Err(e)) => Err(e.to_string()),
    Err(_) => Err("write timed out".to_string()),
  }
}

/// One local OS print queue for the picker. driver_name/port_name let the UI
/// hint which queues are likely Zebra/raw-capable (never for filtering).
#[derive(serde::Serialize)]
pub struct LocalPrinter {
  system_name: String,
  name: String,
  driver_name: String,
  port_name: String,
}

// Windows winspool defaults pDatatype to RAW; passing a CUPS MIME there would
// set an invalid datatype. CUPS needs the explicit raw format to bypass filters.
#[cfg(windows)]
const RAW_PROPS: &[(&str, &str)] = &[];
#[cfg(not(windows))]
const RAW_PROPS: &[(&str, &str)] = &[("document-format", "application/vnd.cups-raw")];

#[tauri::command]
pub async fn list_printers() -> Result<Vec<LocalPrinter>, String> {
  tauri::async_runtime::spawn_blocking(|| {
    // No default-printer lookup: printers::get_default_printer() has a Windows
    // dangling-deref when no default is set, and the UI sorts Zebra-first anyway.
    printers::get_printers()
      .into_iter()
      .map(|p| LocalPrinter {
        system_name: p.system_name,
        name: p.name,
        driver_name: p.driver_name,
        port_name: p.port_name,
      })
      .collect::<Vec<_>>()
  })
  .await
  .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_zpl_local(printer: String, zpl: String) -> Result<(), String> {
  if zpl.len() > MAX_ZPL_BYTES {
    return Err("payload too large".to_string());
  }
  tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
    // Allowlist the caller's string against enumerated queues; never hand an
    // arbitrary name to the spooler.
    let target = printers::get_printers()
      .into_iter()
      .find(|p| p.system_name == printer)
      .ok_or_else(|| "unknown printer".to_string())?;
    let opts = printers::common::base::job::PrinterJobOptions {
      name: Some("zpl-designer"),
      raw_properties: RAW_PROPS,
      ..printers::common::base::job::PrinterJobOptions::none()
    };
    target
      .print(zpl.as_bytes(), opts)
      .map(|_| ())
      .map_err(|e| e.message)
  })
  .await
  .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_empty_and_malformed_hosts() {
    assert!(validate("", 9100, 10).is_err());
    assert!(validate("http://x", 9100, 10).is_err());
    assert!(validate("a b", 9100, 10).is_err());
    assert!(validate("192.168.1.20", 9100, 10).is_ok());
    assert!(validate("printer.local", 9100, 10).is_ok());
  }

  #[test]
  fn rejects_port_zero_and_oversized_payload() {
    assert!(validate("h", 0, 10).is_err());
    assert!(validate("h", 9100, MAX_ZPL_BYTES + 1).is_err());
    assert!(validate("h", 9100, MAX_ZPL_BYTES).is_ok());
  }

  fn rt() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()
  }

  #[test]
  fn sends_exact_bytes_to_a_listener() {
    rt().block_on(async {
      let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
      let port = listener.local_addr().unwrap().port();
      let server = tokio::spawn(async move {
        let (mut sock, _) = listener.accept().await.unwrap();
        let mut buf = Vec::new();
        tokio::io::AsyncReadExt::read_to_end(&mut sock, &mut buf).await.unwrap();
        buf
      });
      let res = send_zpl_tcp("127.0.0.1".into(), port, "^XA^FDx^FS^XZ".into()).await.unwrap();
      assert!(matches!(res, TcpSendResult::Sent));
      assert_eq!(server.await.unwrap(), b"^XA^FDx^FS^XZ");
    });
  }

  #[test]
  fn reports_refused_when_nothing_listens() {
    rt().block_on(async {
      // Bind then drop to get a loopback port that is momentarily free.
      let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
      let port = listener.local_addr().unwrap().port();
      drop(listener);
      let res = send_zpl_tcp("127.0.0.1".into(), port, "^XA^XZ".into()).await.unwrap();
      assert!(matches!(res, TcpSendResult::Refused));
    });
  }
}
