// Fail-closed license gate for PRODUCTION dependencies (what ships in dist/).
// A dependency is allowed only if its SPDX license is on the permissive ALLOW
// list; anything else (copyleft, source-available, or unidentified) fails CI,
// so a new dep with an unreviewed license can't ship silently. Adding an id to
// ALLOW is a deliberate review step. Dev-only tooling isn't checked (it isn't
// distributed). License data comes from pnpm; expressions are evaluated with
// the canonical spdx-expression-parse (dev-only, npm's own parser).
import parseSpdx from 'spdx-expression-parse';
import { readProdLicenses } from './lib/pnpm-licenses.mjs';

// Permissive SPDX ids we accept in shipped code. OFL-1.1 = the bundled IBM Plex
// fonts (attributed in THIRD-PARTY-LICENSES.md).
const ALLOW = new Set([
  'MIT', 'MIT-0', 'ISC', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause',
  'Apache-2.0', 'BlueOak-1.0.0', 'Unlicense', 'CC0-1.0', 'Zlib', 'Python-2.0',
  'OFL-1.1',
]);
// SPDX "WITH" exceptions we accept. Empty by design: a license carrying an
// exception (e.g. Commons-Clause) is reviewed by hand before being added, since
// an exception can revoke permissions the base id grants.
const ALLOW_WITH = new Set();
// Per-package exceptions (package name), each justified inline. Currently none.
const ALLOW_PKG = new Set();

// Walk the canonical SPDX AST against the allowlist: OR = any branch allowed,
// AND = all branches allowed, WITH = base id and exception both allowed. A leaf
// is allowed iff its id is in ALLOW (the `+` suffix is ignored: a later version
// of a permissive license stays permissive).
function nodeAllowed(node) {
  if (node.conjunction === 'or') return nodeAllowed(node.left) || nodeAllowed(node.right);
  if (node.conjunction === 'and') return nodeAllowed(node.left) && nodeAllowed(node.right);
  if (node.exception) return ALLOW.has(node.license) && ALLOW_WITH.has(node.exception);
  return ALLOW.has(node.license);
}

// Anything that isn't a valid SPDX expression (UNLICENSED, "SEE LICENSE IN ...",
// empty, lowercase operators) throws in the parser and fails closed, so an
// unrecognised license can never pass unreviewed.
function isAllowed(expr) {
  let ast;
  try { ast = parseSpdx(String(expr).trim()); } catch { return false; }
  return nodeAllowed(ast);
}

const byLicense = readProdLicenses();

const offenders = [];
for (const [license, pkgs] of Object.entries(byLicense)) {
  if (isAllowed(license)) continue;
  for (const p of pkgs) if (!ALLOW_PKG.has(p.name)) offenders.push(`${p.name}: ${license || '(none)'}`);
}

if (offenders.length) {
  console.error('Production dependency license not on the allowlist:\n  ' + offenders.join('\n  '));
  console.error('\nReview the license, then either add the SPDX id to ALLOW (or the package to');
  console.error('ALLOW_PKG) in scripts/check-licenses.mjs with a reason, move the dep to');
  console.error('devDependencies if it is build/test only, or remove it.');
  process.exit(1);
}

console.log('License check passed: every production dependency is on the permissive allowlist.');
