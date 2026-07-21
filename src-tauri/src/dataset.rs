//! The neutral tabular result both data sources (db, excel) produce, so neither
//! source owns the other's contract.

use serde::Serialize;

/// Rows beyond this are cut off and flagged; batch printing tens of thousands
/// of labels in one go is out of scope for the editor.
pub(crate) const ROW_CAP: usize = 10_000;

#[derive(Serialize, Debug)]
pub struct Rows {
  pub headers: Vec<String>,
  pub rows: Vec<Vec<String>>,
  pub truncated: bool,
}
