// Shared plumbing for the TCP printer commands: connect, write-with-timeout,
// read-one-reply, the blocking-pool wrapper, and the payload bound, so a
// timeout or classification change lives in one place. The USB transport
// (usb.rs) frames its IO differently (ZLP-terminated writes, short-packet
// reads), so it does its own bulk IO rather than going through these.

use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

/// The webview is untrusted input; bound the payload well above any real batch.
pub(crate) const MAX_ZPL_BYTES: usize = 16 * 1024 * 1024;

const IO_TIMEOUT: Duration = Duration::from_secs(4);

// A ~DY upload of a full label bitmap is ~200 KiB base64; bound far above that.
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
// The printer renders the format before replying, and a label carrying a font
// download (~DY) can take an entry-level printer well past 10s to store, render,
// and answer ^HY (observed: the ZD230 keeps working while a shorter wait times
// out). Generous, since a preview is a manual one-shot the user waits on.
const FIRST_BYTE_TIMEOUT: Duration = Duration::from_secs(30);
// After data flows, a short idle gap marks the end of the reply (the printer
// keeps the channel open, so waiting for a close would always hit the timeout).
const IDLE_TIMEOUT: Duration = Duration::from_millis(1200);
// Overall cap on the read phase: a peer that trickles bytes just under the idle
// gap would otherwise never break, holding the query open until MAX_RESPONSE_BYTES.
const READ_DEADLINE: Duration = Duration::from_secs(60);

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

/// Read one printer reply: wait for the first byte, then collect until an idle
/// gap marks the end. A close/short-read (0 bytes) also ends the reply; a
/// reply that never starts, trickles past the deadline, or overflows the bound
/// is an error. An empty body is reported as "no response" because print-only
/// endpoints accept a job silently, which is not a queryable response.
pub(crate) async fn read_reply(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
  let mut body = Vec::new();
  let mut buf = [0u8; 64 * 1024];
  let deadline = tokio::time::Instant::now() + READ_DEADLINE;
  loop {
    // A complete reply ends on the idle gap long before this cap, so reaching
    // it means the stream is incomplete (slow render, trickle): report the
    // timeout explicitly instead of returning a truncated body downstream.
    if tokio::time::Instant::now() >= deadline {
      return Err("read timed out".to_string());
    }
    let wait = if body.is_empty() {
      FIRST_BYTE_TIMEOUT
    } else {
      IDLE_TIMEOUT
    };
    match timeout(wait, stream.read(&mut buf)).await {
      Ok(Ok(0)) => break, // peer closed / end of stream
      Ok(Ok(n)) => {
        if body.len() + n > MAX_RESPONSE_BYTES {
          return Err("response too large".to_string());
        }
        body.extend_from_slice(&buf[..n]);
      }
      Ok(Err(e)) => return Err(e.to_string()),
      Err(_) if body.is_empty() => return Err("no response from printer".to_string()),
      Err(_) => break, // idle gap after data = end of reply
    }
  }
  if body.is_empty() {
    return Err("no response from printer".to_string());
  }
  Ok(body)
}
