fn main() {
  // tauri-build requires the externalBin sidecar in every profile, but dev
  // spawns from source: a debug placeholder keeps fresh-clone compiles going,
  // and release deletes a leftover placeholder so it can never get bundled.
  let triple = std::env::var("TARGET").unwrap_or_default();
  let ext = if triple.contains("windows") {
    ".exe"
  } else {
    ""
  };
  let path = std::path::PathBuf::from(format!("binaries/zplab-mcp-{triple}{ext}"));
  let is_placeholder = std::fs::metadata(&path).is_ok_and(|m| m.len() == 0);
  if std::env::var("PROFILE").as_deref() == Ok("debug") {
    if !path.exists() {
      let _ = std::fs::create_dir_all("binaries");
      let _ = std::fs::write(&path, b"");
    }
  } else if is_placeholder {
    let _ = std::fs::remove_file(&path);
  }
  tauri_build::build()
}
