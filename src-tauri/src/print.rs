use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::time::timeout;

/// Kinds mirror the frontend NetworkPrintResult union; `sent` is the
/// desktop-only true success the browser transport can never report.
#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TcpSendResult {
  Sent,
  Refused,
  NoResponse,
}

const IO_TIMEOUT: Duration = Duration::from_secs(4);
// The webview is untrusted input; bound the payload well above any real batch.
const MAX_ZPL_BYTES: usize = 16 * 1024 * 1024;

fn validate(host: &str, port: u16, zpl_len: usize) -> Result<(), String> {
  if host.is_empty() || host.contains('/') || host.contains(char::is_whitespace) {
    return Err("invalid host".into());
  }
  if port == 0 {
    return Err("invalid port".into());
  }
  if zpl_len > MAX_ZPL_BYTES {
    return Err("payload too large".into());
  }
  Ok(())
}

#[tauri::command]
pub async fn send_zpl_tcp(host: String, port: u16, zpl: String) -> Result<TcpSendResult, String> {
  let host = host.trim().to_string();
  validate(&host, port, zpl.len())?;

  let mut stream = match timeout(IO_TIMEOUT, TcpStream::connect((host.as_str(), port))).await {
    Err(_) => return Ok(TcpSendResult::NoResponse),
    Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionRefused => {
      return Ok(TcpSendResult::Refused)
    }
    Ok(Err(e)) => return Err(e.to_string()),
    Ok(Ok(s)) => s,
  };

  match timeout(IO_TIMEOUT, async {
    stream.write_all(zpl.as_bytes()).await?;
    stream.shutdown().await
  })
  .await
  {
    Err(_) => Ok(TcpSendResult::NoResponse),
    Ok(Err(e)) => Err(e.to_string()),
    Ok(Ok(())) => Ok(TcpSendResult::Sent),
  }
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
