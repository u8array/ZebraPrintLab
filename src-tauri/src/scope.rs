//! Rust-owned file authority for the data-source commands: paths become
//! usable only through the native pick commands below, never from webview
//! input. Sqlite grants persist (saved profiles reconnect across restarts);
//! excel grants are session-only like any other one-shot import.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct PathGrants {
  session: Mutex<HashSet<PathBuf>>,
  persistent: Mutex<HashSet<PathBuf>>,
  /// Store file, resolved once at load; None = in-memory only (best-effort).
  file: Option<PathBuf>,
}

impl PathGrants {
  pub fn load<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Self {
    let file = grants_file(app);
    Self {
      persistent: Mutex::new(file.as_deref().map(read_grants).unwrap_or_default()),
      file,
      ..Self::default()
    }
  }

  /// Grant, check, and revoke all compare through `canon`, so `..`/symlink
  /// spellings can't dodge or spoof a grant.
  #[must_use]
  pub fn is_granted(&self, path: &str) -> bool {
    let probe = match canon(path) {
      Ok(canon) => canon,
      // Unresolvable (deleted file, offline share): match the granted spelling
      // literally so the command surfaces the real IO error, not a misleading
      // "not granted". Nothing readable is granted; unknown spellings stay denied.
      Err(_) => PathBuf::from(path),
    };
    self.session.lock().unwrap().contains(&probe)
      || self.persistent.lock().unwrap().contains(&probe)
  }

  fn grant(&self, kind: GrantKind, canon: PathBuf) {
    match kind {
      GrantKind::Persistent => {
        let mut set = self.persistent.lock().unwrap();
        set.insert(canon);
        self.persist(&set);
      }
      GrantKind::Session => {
        self.session.lock().unwrap().insert(canon);
      }
    }
  }

  fn revoke(&self, path: &str) {
    let mut set = self.persistent.lock().unwrap();
    if revoke_from(&mut set, path) {
      self.persist(&set);
    }
  }

  /// Called under the persistent lock so store writes can't interleave.
  fn persist(&self, set: &HashSet<PathBuf>) {
    if let Some(file) = &self.file {
      write_grants(file, set);
    }
  }
}

/// The one canonicalizer for grant/check/revoke; all sides must agree
/// byte-for-byte or a grant becomes unfindable. dunce strips Windows'
/// `\\?\` prefix so stored forms equal user-visible profile paths.
fn canon(path: impl AsRef<Path>) -> std::io::Result<PathBuf> {
  dunce::canonicalize(path)
}

fn grants_file<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
  app
    .path()
    .app_config_dir()
    .ok()
    .map(|d| d.join("db-path-grants.json"))
}

fn read_grants(file: &Path) -> HashSet<PathBuf> {
  std::fs::read_to_string(file)
    .ok()
    .and_then(|s| serde_json::from_str::<HashSet<PathBuf>>(&s).ok())
    .unwrap_or_default()
}

fn write_grants(file: &Path, grants: &HashSet<PathBuf>) {
  let Ok(json) = serde_json::to_vec(grants) else {
    return;
  };
  if let Some(dir) = file.parent() {
    let _ = std::fs::create_dir_all(dir);
  }
  // Best-effort: a failed write only costs a re-pick after the next restart.
  let _ = std::fs::write(file, json);
}

/// Whether a granted path outlives the session. Sqlite profiles reconnect
/// across restarts (persist); excel is a one-shot import (session).
enum GrantKind {
  Session,
  Persistent,
}

/// Native pick on the blocking pool (the dialog blocks its calling thread),
/// then grant the canonicalized path. Returns the canonical path (what the
/// profile stores), None on cancel.
async fn pick_and_grant(
  app: tauri::AppHandle,
  filter_name: &'static str,
  extensions: &'static [&'static str],
  kind: GrantKind,
  suggest: Option<String>,
) -> Result<Option<String>, String> {
  let dialog_app = app.clone();
  let picked = tauri::async_runtime::spawn_blocking(move || {
    let mut dialog = dialog_app
      .dialog()
      .file()
      .add_filter(filter_name, extensions);
    // Preseed with the profile's current path: a re-pick (upgrade migration,
    // moved file) is then a one-click confirm. Untrusted input is fine here,
    // it only positions the dialog; granted is whatever the user confirms.
    if let Some(prev) = suggest.as_deref().map(Path::new) {
      if let Some(dir) = prev.parent() {
        dialog = dialog.set_directory(dir);
      }
      if let Some(name) = prev.file_name() {
        dialog = dialog.set_file_name(name.to_string_lossy());
      }
    }
    dialog.blocking_pick_file()
  })
  .await
  .map_err(|e| e.to_string())?;
  let Some(picked) = picked else {
    return Ok(None);
  };
  let path = picked.into_path().map_err(|e| e.to_string())?;
  let canon = canon(&path).map_err(|e| e.to_string())?;
  // The profile stores this exact spelling (see canon).
  let display = canon.to_string_lossy().into_owned();
  app.state::<PathGrants>().grant(kind, canon);
  Ok(Some(display))
}

#[tauri::command]
pub async fn pick_sqlite_file(
  app: tauri::AppHandle,
  suggest: Option<String>,
) -> Result<Option<String>, String> {
  pick_and_grant(
    app,
    "SQLite",
    &["sqlite", "sqlite3", "db", "db3"],
    GrantKind::Persistent,
    suggest,
  )
  .await
}

#[tauri::command]
pub async fn pick_excel_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
  pick_and_grant(
    app,
    "Excel",
    &["xlsx", "xlsm", "xls", "ods"],
    GrantKind::Session,
    None,
  )
  .await
}

/// Webview-callable because revocation only shrinks authority (worst case is
/// a re-pick); keeps the persisted set from ratcheting up forever. `keep` =
/// still-referenced paths, compared canonically HERE so respellings survive.
#[tauri::command]
pub fn revoke_db_path(app: tauri::AppHandle, path: String, keep: Vec<String>) {
  if still_referenced(&keep, &path) {
    return;
  }
  app.state::<PathGrants>().revoke(&path);
}

/// Literal compare catches dead paths (both sides uncanonicalizable),
/// same_file catches a live sibling under another spelling.
fn still_referenced(keep: &[String], path: &str) -> bool {
  keep.iter().any(|k| k == path || same_file(k, path))
}

/// False when either side no longer canonicalizes: a dead path then goes
/// through the revoke's literal fallback instead of being kept.
fn same_file(a: &str, b: &str) -> bool {
  match (canon(a), canon(b)) {
    (Ok(a), Ok(b)) => a == b,
    _ => false,
  }
}

/// Stored forms are canonical; the literal fallback covers a file already
/// deleted (no longer canonicalizable) that was stored under this spelling.
fn revoke_from(set: &mut HashSet<PathBuf>, path: &str) -> bool {
  match canon(path) {
    Ok(canon) => set.remove(&canon),
    Err(_) => set.remove(Path::new(path)),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("zplab-path-grants");
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join(name);
    std::fs::write(&file, b"x").unwrap();
    file
  }

  #[test]
  fn ungranted_paths_are_refused() {
    let grants = PathGrants::default();
    // Existing but never picked: the forged-IPC case.
    assert!(!grants.is_granted(&scratch("data.db").to_string_lossy()));
    assert!(!grants.is_granted("C:/missing/nowhere.db"));
  }

  #[test]
  fn granted_paths_pass_under_any_spelling() {
    let grants = PathGrants::default();
    let file = scratch("granted.db");
    let canon = canon(&file).unwrap();
    grants.session.lock().unwrap().insert(canon);
    assert!(grants.is_granted(&file.to_string_lossy()));
    // A `..` respelling of the same file resolves to the same grant.
    let dodged = file
      .parent()
      .unwrap()
      .join("..")
      .join("zplab-path-grants")
      .join("granted.db");
    assert!(grants.is_granted(&dodged.to_string_lossy()));
    assert!(!grants.is_granted(&scratch("other.db").to_string_lossy()));
  }

  #[test]
  fn persisted_grants_survive_a_reload() {
    let file = scratch("reloaded.db");
    let canon = canon(&file).unwrap();
    let store = std::env::temp_dir()
      .join("zplab-path-grants")
      .join("store.json");
    let mut set = HashSet::new();
    set.insert(canon);
    write_grants(&store, &set);
    // The restart path: a fresh state built from the written file.
    let reloaded = PathGrants {
      persistent: Mutex::new(read_grants(&store)),
      ..PathGrants::default()
    };
    assert!(reloaded.is_granted(&file.to_string_lossy()));
  }

  #[test]
  fn revoke_removes_the_grant_under_any_spelling() {
    let file = scratch("revoke.db");
    let canon = canon(&file).unwrap();
    let mut set = HashSet::new();
    set.insert(canon.clone());
    // Non-canonical spelling of an existing file still hits the stored form.
    assert!(revoke_from(&mut set, &file.to_string_lossy()));
    assert!(set.is_empty());
    // Deleted file: the literal fallback removes a literally-stored entry.
    set.insert(PathBuf::from("C:/gone/old.db"));
    assert!(revoke_from(&mut set, "C:/gone/old.db"));
    assert!(set.is_empty());
  }

  #[test]
  fn same_file_matches_across_spellings_and_fails_closed() {
    let file = scratch("same.db");
    let respelled = file
      .parent()
      .unwrap()
      .join("..")
      .join("zplab-path-grants")
      .join("same.db");
    assert!(same_file(
      &file.to_string_lossy(),
      &respelled.to_string_lossy()
    ));
    assert!(!same_file(
      &file.to_string_lossy(),
      &scratch("other.db").to_string_lossy()
    ));
    // Dead old path: not "same", so the replace flow revokes it.
    assert!(!same_file("C:/gone/old.db", &file.to_string_lossy()));
  }

  #[test]
  fn a_granted_then_deleted_file_stays_granted_under_its_stored_spelling() {
    // The command then proceeds and surfaces the real IO error ("unable to
    // open"), not a misleading PathNotAllowed.
    let file = scratch("vanished.db");
    let stored = canon(&file).unwrap();
    let ui_path = stored.to_string_lossy().into_owned();
    let grants = PathGrants::default();
    grants.persistent.lock().unwrap().insert(stored);
    std::fs::remove_file(&file).unwrap();
    assert!(grants.is_granted(&ui_path));
    // A never-granted dead path still fails closed.
    assert!(!grants.is_granted("C:/missing/nowhere.db"));
  }

  #[test]
  fn revoke_finds_a_deleted_files_stored_entry() {
    // Grant while the file exists, then delete it: the stored canonical form
    // equals the profile path (pick returns it), so the literal fallback hits.
    let file = scratch("deleted.db");
    let stored = canon(&file).unwrap();
    let ui_path = stored.to_string_lossy().into_owned();
    let mut set = HashSet::new();
    set.insert(stored);
    std::fs::remove_file(&file).unwrap();
    assert!(revoke_from(&mut set, &ui_path));
    assert!(set.is_empty());
  }

  #[test]
  fn still_referenced_matches_respellings_and_dead_literals() {
    let file = scratch("shared.db");
    let respelled = file
      .parent()
      .unwrap()
      .join("..")
      .join("zplab-path-grants")
      .join("shared.db");
    // A sibling profile under another spelling of the same live file.
    assert!(still_referenced(
      &[respelled.to_string_lossy().into_owned()],
      &file.to_string_lossy()
    ));
    // A dead path kept only by literal equality.
    assert!(still_referenced(
      &["C:/gone/old.db".into()],
      "C:/gone/old.db"
    ));
    assert!(!still_referenced(
      &[scratch("unrelated.db").to_string_lossy().into_owned()],
      &file.to_string_lossy()
    ));
  }

  #[test]
  fn missing_or_corrupt_store_yields_no_grants() {
    assert!(read_grants(Path::new("C:/missing/store.json")).is_empty());
    let bad = scratch("bad.json");
    assert!(read_grants(&bad).is_empty());
  }
}
