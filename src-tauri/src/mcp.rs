//! Lifecycle for the loopback MCP server child process: a bearer-authenticated
//! HTTP MCP server the desktop app can toggle. These commands spawn, stop, and
//! probe it, and the app kills it on exit so it never outlives the window.

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

/// Tauri event carrying an openDraft design file to the editor.
const OPEN_DRAFT_EVENT: &str = "mcp://open-draft";

/// Windows: kill-on-close Job Object that ties the child's cmd/pnpm/node tree
/// to the app. Closing the handle (explicitly, or when the process dies and the
/// OS closes it) terminates the whole tree, so grandchildren never orphan.
#[cfg(windows)]
mod job {
  use std::os::windows::io::AsRawHandle;
  use std::process::Child;
  use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
  use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
  };

  /// Job handle stored as isize so McpState stays Send (a raw HANDLE pointer is
  /// not). We only ever hand it back to Win32, never dereference it.
  pub struct Job(isize);

  // SAFETY: a Win32 job handle is a process-global kernel object, safe to move
  // and close from any thread; the pointer is never dereferenced.
  unsafe impl Send for Job {}

  impl Drop for Job {
    /// Closing the kill-on-close handle terminates any process still in the job.
    fn drop(&mut self) {
      // SAFETY: self.0 is the sole owner of a live job handle, closed once here.
      unsafe { CloseHandle(self.0 as HANDLE) };
    }
  }

  /// Create a kill-on-close job and assign `child` to it. None if any Win32 call
  /// fails, in which case the caller falls back to a plain child kill.
  pub fn assign(child: &Child) -> Option<Job> {
    // SAFETY: CreateJobObjectW returns a valid handle we own until CloseHandle
    // (via Job's Drop). `info` is a fully-zeroed, correctly-sized struct and we
    // pass its matching byte length. child.as_raw_handle() is a live process
    // handle owned by `child`, valid for the duration of this call.
    unsafe {
      let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
      if handle.is_null() {
        return None;
      }
      let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
      info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      let set = SetInformationJobObject(
        handle,
        JobObjectExtendedLimitInformation,
        std::ptr::addr_of!(info).cast::<core::ffi::c_void>(),
        std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
      );
      let assigned = AssignProcessToJobObject(handle, child.as_raw_handle() as HANDLE);
      if set == 0 || assigned == 0 {
        CloseHandle(handle);
        return None;
      }
      Some(Job(handle as isize))
    }
  }
}

/// Liveness of the stored child, distinguishing "gone" (concurrently stopped)
/// from "crashed" so startup can report the right failure.
enum ChildStatus {
  Alive,
  Exited,
  Absent,
}

/// Managed handle to the running server child, if any.
#[derive(Default)]
pub struct McpState {
  child: Mutex<Option<Child>>,
  /// Held for the whole of mcp_start so concurrent starts serialize instead of
  /// racing the TOCTOU is_running() check.
  start_lock: tokio::sync::Mutex<()>,
  #[cfg(windows)]
  job: Mutex<Option<job::Job>>,
}

impl McpState {
  /// Kill and reap the child if one is running. Idempotent.
  pub fn kill(&self) {
    if let Some(mut child) = self.child.lock().unwrap().take() {
      #[cfg(unix)]
      {
        // The child leads its own process group (process_group(0)); signal the
        // group so pnpm/node grandchildren die with it, not just the shell.
        unsafe { libc::killpg(child.id() as libc::pid_t, libc::SIGKILL) };
      }
      let _ = child.kill();
      let _ = child.wait();
    }
    // Drop the job after the child: closing its kill-on-close handle terminates
    // any grandchildren that survived the direct kill. take()->drop is a no-op
    // when already cleared, so kill stays idempotent.
    #[cfg(windows)]
    drop(self.job.lock().unwrap().take());
  }

  /// True while the child is alive. Reaps and clears it if it has exited, so
  /// status reflects a server that crashed instead of a stale handle.
  fn is_running(&self) -> bool {
    let mut guard = self.child.lock().unwrap();
    match guard.as_mut() {
      Some(child) => match child.try_wait() {
        Ok(Some(_)) => {
          *guard = None;
          false
        }
        _ => true,
      },
      None => false,
    }
  }

  fn child_status(&self) -> ChildStatus {
    let mut guard = self.child.lock().unwrap();
    match guard.as_mut() {
      None => ChildStatus::Absent,
      Some(child) => match child.try_wait() {
        Ok(Some(_)) => ChildStatus::Exited,
        _ => ChildStatus::Alive,
      },
    }
  }
}

/// How long to await the child's `listening` signal before declaring the spawn
/// a failure.
const READY_TIMEOUT: Duration = Duration::from_secs(2);

#[cfg(windows)]
fn suppress_console(cmd: &mut Command) {
  use std::os::windows::process::CommandExt;
  const CREATE_NO_WINDOW: u32 = 0x0800_0000;
  cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn suppress_console(_cmd: &mut Command) {}

/// Whether this build can spawn the sidecar; the capability mcp_status reports
/// so the UI can hide the controls instead of offering a server that cannot
/// start. Must flip together with mcp_command when bundling lands.
pub const SIDECAR_AVAILABLE: bool = cfg!(debug_assertions);

/// The child that serves the MCP HTTP transport. Dev runs the workspace package
/// from source; release fails honestly until the sidecar binary is bundled.
#[cfg(debug_assertions)]
fn mcp_command(port: u16, token: &str) -> Result<Command, String> {
  // cwd is the repo root (src-tauri's parent) so the pnpm workspace filter
  // resolves the package.
  let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .ok_or("cannot resolve repo root")?;
  // cmd /C so CreateProcess finds corepack's pnpm.cmd shim (no pnpm.exe).
  #[cfg(windows)]
  let mut cmd = {
    let mut c = Command::new("cmd");
    c.args(["/C", "pnpm"]);
    c
  };
  #[cfg(not(windows))]
  let mut cmd = Command::new("pnpm");
  cmd.current_dir(repo_root).args([
    "--filter",
    "@zplab/mcp-server",
    "exec",
    "tsx",
    "src/index.ts",
    "--http",
    "--port",
    &port.to_string(),
    "--token",
    token,
  ]);
  Ok(cmd)
}

#[cfg(not(debug_assertions))]
fn mcp_command(_port: u16, _token: &str) -> Result<Command, String> {
  // Bundling the sidecar binary is a deferred follow-up; fail instead of
  // spawning a dev toolchain that release machines do not have. Stable code the
  // frontend maps to a localized message.
  Err("sidecar_not_bundled".to_string())
}

/// Extract the design file payload from a child stdout line, or None if the
/// line is not an openDraft event (dev logging, partial output). The child
/// emits these lines only in HTTP mode, where stdout is not the JSON-RPC channel.
fn open_draft_payload(line: &str) -> Option<String> {
  let value: serde_json::Value = serde_json::from_str(line).ok()?;
  if value.get("zplabEvent")?.as_str()? != "openDraft" {
    return None;
  }
  Some(value.get("designFile")?.to_string())
}

/// True for the child's one-shot `{"zplabEvent":"listening"}` line, emitted once
/// the HTTP server has bound its port.
fn is_listening_event(line: &str) -> bool {
  serde_json::from_str::<serde_json::Value>(line)
    .ok()
    .and_then(|v| v.get("zplabEvent")?.as_str().map(|s| s == "listening"))
    .unwrap_or(false)
}

/// Signal readiness on the child's first `listening` stdout line, then forward
/// openDraft events. Ends when stdout closes; dropping an unused `ready` sender
/// then makes wait_until_ready observe the child as gone.
fn forward_open_draft(
  stdout: std::process::ChildStdout,
  app: AppHandle,
  ready: oneshot::Sender<()>,
) {
  use std::io::BufRead;
  let mut ready = Some(ready);
  for line in std::io::BufReader::new(stdout).lines() {
    let Ok(line) = line else { break };
    if is_listening_event(&line) {
      if let Some(tx) = ready.take() {
        let _ = tx.send(());
      }
      continue;
    }
    if let Some(payload) = open_draft_payload(&line) {
      let _ = app.emit(OPEN_DRAFT_EVENT, payload);
    }
  }
}

/// Await the child's own `listening` signal: only OUR child bound the port (a
/// foreign listener can't forge it), and a child dying first drops the sender,
/// surfacing as "exited during startup" rather than a timeout.
async fn wait_until_ready(ready: oneshot::Receiver<()>) -> Result<(), String> {
  match tokio::time::timeout(READY_TIMEOUT, ready).await {
    Ok(Ok(())) => Ok(()),
    Ok(Err(_)) => Err("mcp server exited during startup (port in use?)".to_string()),
    Err(_) => Err("mcp server did not start within timeout".to_string()),
  }
}

/// Start the MCP server on `port` with bearer `token`; a no-op if already
/// running. Waits for the child's `listening` signal, killing the child and
/// returning an error on timeout. The token is never logged.
#[tauri::command]
pub async fn mcp_start(
  app: AppHandle,
  state: State<'_, McpState>,
  port: u16,
  token: String,
) -> Result<(), String> {
  // Serialize starts: a second concurrent call waits, then sees is_running().
  let _start = state.start_lock.lock().await;
  if state.is_running() {
    return Ok(());
  }
  let mut cmd = mcp_command(port, &token)?;
  suppress_console(&mut cmd);
  // Pipe stdout for the openDraft event channel; stderr stays inherited.
  cmd.stdout(Stdio::piped());
  #[cfg(unix)]
  {
    // Own process group so kill() can SIGKILL the whole pnpm/node tree.
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
  }
  let mut child = cmd
    .spawn()
    .map_err(|e| format!("failed to spawn mcp server: {e}"))?;
  // Known micro-race: a grandchild forked between spawn and AssignProcessToJobObject
  // escapes the job's kill-on-close. The canonical fix (CREATE_SUSPENDED + ResumeThread)
  // needs the primary-thread handle std::process::Child does not expose.
  #[cfg(windows)]
  {
    *state.job.lock().unwrap() = job::assign(&child);
  }
  let (ready_tx, ready_rx) = oneshot::channel();
  if let Some(stdout) = child.stdout.take() {
    std::thread::spawn(move || forward_open_draft(stdout, app, ready_tx));
  }
  // Store before the wait so a teardown mid-startup still reaps the child.
  *state.child.lock().unwrap() = Some(child);
  match wait_until_ready(ready_rx).await {
    // A concurrent mcp_stop can take our child while we waited; only report
    // success if it is still ours and alive.
    Ok(()) if matches!(state.child_status(), ChildStatus::Alive) => Ok(()),
    // Also clears the job handle on this path so it is not leaked.
    Ok(()) => {
      state.kill();
      Err("stopped during startup".to_string())
    }
    Err(e) => {
      state.kill();
      Err(e)
    }
  }
}

#[tauri::command]
pub fn mcp_stop(state: State<'_, McpState>) {
  state.kill();
}

#[derive(serde::Serialize)]
pub struct McpStatus {
  pub running: bool,
  pub available: bool,
}

#[tauri::command]
pub fn mcp_status(state: State<'_, McpState>) -> McpStatus {
  McpStatus {
    running: state.is_running(),
    available: SIDECAR_AVAILABLE,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn status_serializes_running_and_available_flags() {
    let json = serde_json::to_string(&McpStatus {
      running: true,
      available: false,
    })
    .unwrap();
    assert_eq!(json, r#"{"running":true,"available":false}"#);
  }

  #[test]
  fn empty_state_reports_not_running() {
    let state = McpState::default();
    assert!(!state.is_running());
    // kill is a no-op when nothing runs.
    state.kill();
    assert!(!state.is_running());
  }

  #[test]
  fn open_draft_payload_extracts_design_file() {
    let line = r#"{"zplabEvent":"openDraft","designFile":{"schemaVersion":3}}"#;
    assert_eq!(
      open_draft_payload(line),
      Some(r#"{"schemaVersion":3}"#.to_string())
    );
  }

  #[test]
  fn open_draft_payload_ignores_non_events() {
    assert_eq!(open_draft_payload("plain dev log line"), None);
    assert_eq!(open_draft_payload(r#"{"other":"json"}"#), None);
    assert_eq!(
      open_draft_payload(r#"{"zplabEvent":"openDraft"}"#),
      None,
      "missing designFile is not forwardable"
    );
  }

  #[test]
  fn is_listening_event_matches_only_the_listening_line() {
    assert!(is_listening_event(
      r#"{"zplabEvent":"listening","port":4923}"#
    ));
    assert!(!is_listening_event(r#"{"zplabEvent":"openDraft"}"#));
    assert!(!is_listening_event("plain dev log line"));
  }

  #[test]
  fn wait_until_ready_succeeds_on_signal() {
    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async {
      let (tx, rx) = oneshot::channel();
      tx.send(()).unwrap();
      assert!(wait_until_ready(rx).await.is_ok());
    });
  }

  #[test]
  fn wait_until_ready_reports_exit_when_sender_dropped() {
    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async {
      // Sender dropped without a value = child's stdout closed = child gone.
      let (tx, rx) = oneshot::channel::<()>();
      drop(tx);
      let err = wait_until_ready(rx).await.unwrap_err();
      assert_eq!(err, "mcp server exited during startup (port in use?)");
    });
  }

  #[test]
  fn wait_until_ready_times_out_when_never_signaled() {
    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async {
      // Hold the sender so it neither signals nor drops: only the timeout fires.
      let (_tx, rx) = oneshot::channel::<()>();
      let err = wait_until_ready(rx).await.unwrap_err();
      assert_eq!(err, "mcp server did not start within timeout");
    });
  }

  #[test]
  fn start_lock_serializes_holders() {
    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .unwrap();
    rt.block_on(async {
      let state = McpState::default();
      let held = state.start_lock.lock().await;
      assert!(state.start_lock.try_lock().is_err());
      drop(held);
      assert!(state.start_lock.try_lock().is_ok());
    });
  }
}
