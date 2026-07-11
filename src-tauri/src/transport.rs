// Shared plumbing for printer commands: TCP IO, the blocking-pool wrapper, and
// the payload bound, so a timeout or classification change lives in one place.

use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::time::timeout;

/// The webview is untrusted input; bound the payload well above any real batch.
pub(crate) const MAX_ZPL_BYTES: usize = 16 * 1024 * 1024;

const IO_TIMEOUT: Duration = Duration::from_secs(4);

pub(crate) fn check_payload(len: usize) -> Result<(), String> {
  if len > MAX_ZPL_BYTES {
    return Err("payload too large".to_string());
  }
  Ok(())
}

/// Run a blocking closure on the runtime's blocking pool, flattening the
/// `JoinError` into a String so every blocking command drops that boilerplate.
pub(crate) async fn blocking<F, T>(f: F) -> Result<T, String>
where
  F: FnOnce() -> T + Send + 'static,
  T: Send + 'static,
{
  tauri::async_runtime::spawn_blocking(f)
    .await
    .map_err(|e| e.to_string())
}

/// Why a connect failed; callers map it onto their own result enum so the UI
/// keeps a single message mapping regardless of which command ran.
pub(crate) enum ConnectError {
  Refused,
  Unreachable,
}

pub(crate) async fn connect(host: &str, port: u16) -> Result<TcpStream, ConnectError> {
  match timeout(IO_TIMEOUT, TcpStream::connect((host, port))).await {
    Ok(Ok(s)) => Ok(s),
    Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionRefused => Err(ConnectError::Refused),
    // Timeout, no route, unresolvable host: the printer can't be reached.
    Err(_) | Ok(Err(_)) => Err(ConnectError::Unreachable),
  }
}

pub(crate) async fn write_all_timeout(stream: &mut TcpStream, bytes: &[u8]) -> Result<(), String> {
  match timeout(IO_TIMEOUT, stream.write_all(bytes)).await {
    Ok(Ok(())) => Ok(()),
    Ok(Err(e)) => Err(e.to_string()),
    Err(_) => Err("write timed out".to_string()),
  }
}
