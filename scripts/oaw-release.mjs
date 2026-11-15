// Build the OAW template release manifest that the update page applies to customer repos.
// Usage: node scripts/oaw-release.mjs <oaw-template checkout> <notes.json>
//   notes.json: { "version": "2026.11.15", "notes": ["……", "……"] }
// Writes supabase/functions/_shared/oaw-release.json (version + notes, also shown on the page)
// and supabase/functions/_shared/oaw-release-files.json (per-path blob SHAs).
// "known" lists every blob a path has had in any template commit, so a customer file that
// matches one of them is unmodified and safe to replace; anything else is the customer's edit.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [dir, notesFile] = process.argv.slice(2);
if (!dir || !notesFile)
  throw Error('usage: node scripts/oaw-release.mjs <template dir> <notes.json>');
const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
// Customer data that an update must never touch.
export const PROTECTED = [
  'oaw/config.json',
  'oaw/status.json',
  'liff/config.js',
  'oaw/template-version.json',
];

const { version, notes } = JSON.parse(readFileSync(notesFile, 'utf8'));
if (!/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/.test(version) || !Array.isArray(notes) || !notes.length)
  throw Error('notes.json needs version YYYY.MM.DD and a non-empty notes list');
const ref = git('rev-parse', 'origin/main').trim();
const tree = (commit) =>
  git('ls-tree', '-r', commit)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [meta, path] = l.split('\t');
      const [mode, type, sha] = meta.split(' ');
      return { path, mode, type, sha };
    })
    .filter((e) => e.type === 'blob' && !PROTECTED.includes(e.path));

const files = {};
for (const e of tree(ref)) files[e.path] = { sha: e.sha, mode: e.mode, known: [] };
const known = {};
for (const commit of git('rev-list', '--all').trim().split('\n'))
  for (const e of tree(commit)) (known[e.path] ??= new Set()).add(e.sha);
for (const [path, shas] of Object.entries(known)) {
  files[path] ??= { sha: null, mode: '100644', known: [] }; // removed from the template
  files[path].known = [...shas].filter((s) => s !== files[path].sha).sort();
}

const out = 'supabase/functions/_shared/';
writeFileSync(out + 'oaw-release.json', JSON.stringify({ version, ref, notes }, null, 2) + '\n');
writeFileSync(out + 'oaw-release-files.json', JSON.stringify({ ref, files }) + '\n');
console.log(`release ${version} @ ${ref.slice(0, 7)}: ${Object.keys(files).length} paths`);
