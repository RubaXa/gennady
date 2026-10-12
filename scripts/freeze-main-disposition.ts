// @file: Explicit mechanical raw-blob freeze from reviewed Git refs and authored dispositions.
// @spec: INFRA-BASE
// @consumers: R4 archive authoring only; not runtime or publication

import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  ARCHIVE_ROOT,
  MANIFEST_PATH,
  createFrozenManifest,
  git,
  readSafe,
} from './main-carry-disposition.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (process.argv.slice(2).join(' ') !== '--write')
  throw new Error('Explicit --write is required for archive authoring');
const manifest = createFrozenManifest(root);
const objects = join(root, ARCHIVE_ROOT, 'objects');
if (
  existsSync(objects) &&
  (!lstatSync(objects).isDirectory() || lstatSync(objects).isSymbolicLink())
)
  throw new Error('Refuse unsafe frozen objects directory');
if (existsSync(join(root, MANIFEST_PATH))) readSafe(root, MANIFEST_PATH);
mkdirSync(objects, { recursive: true });
for (const row of manifest.rows) {
  for (const identity of [row.base, row.source]) {
    if (!identity) continue;
    const path = `${ARCHIVE_ROOT}/objects/${identity.oid}.blob`;
    const bytes = git(root, ['cat-file', 'blob', identity.oid]);
    if (existsSync(join(root, path))) {
      if (!readSafe(root, path).equals(bytes))
        throw new Error(`Refuse to replace corrupt frozen object: ${path}`);
    } else writeFileSync(join(root, path), bytes, { flag: 'wx' });
  }
}
writeFileSync(
  join(root, MANIFEST_PATH),
  await format(JSON.stringify(manifest), { parser: 'json' })
);
process.stdout.write(
  `Frozen ${manifest.rows.length} records / ${manifest.commits.length} commit refs.\n`
);
