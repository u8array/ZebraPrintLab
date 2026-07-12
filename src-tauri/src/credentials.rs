//! OS-native credential storage (Windows Credential Manager, macOS Keychain,
//! Linux Secret Service). Keeps API keys out of localStorage/app-data JSON,
//! which live as plaintext on disk.

use keyring::Entry;

use crate::transport::blocking;

/// Keychain service name; the credential name (e.g. "labelary-api-key") is
/// the account under it.
const SERVICE: &str = "ZPLab";

fn entry(name: &str) -> Result<Entry, String> {
  Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn credential_get(name: String) -> Result<Option<String>, String> {
  // keyring is blocking (DBus/OS calls); keep it off the async runtime.
  blocking(move || match entry(&name)?.get_password() {
    Ok(v) => Ok(Some(v)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  })
  .await?
}

#[tauri::command]
pub async fn credential_set(name: String, value: String) -> Result<(), String> {
  blocking(move || {
    entry(&name)?
      .set_password(&value)
      .map_err(|e| e.to_string())
  })
  .await?
}

#[tauri::command]
pub async fn credential_delete(name: String) -> Result<(), String> {
  blocking(move || match entry(&name)?.delete_credential() {
    // Deleting a missing entry is the caller's desired end state, not an error.
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  })
  .await?
}
