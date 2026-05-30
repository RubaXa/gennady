// @file: Build inverted word index from file headers and entity DBC contracts.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { FileWordRef, ScannedFile } from '../orient.types.ts';

/**
 * @purpose Build an inverted index: word -> Set of {file, source, entity?} references.
 * @invariant Words lowercased, split on non-alphanumeric boundaries, extracted from @file: value and entity @purpose text.
 * @param files Scanned files with parsed headers and exports.
 * @returns Map from normalized word to matching FileWordRef set.
 */
export function buildIndex(files: ScannedFile[]): Map<string, Set<FileWordRef>> {
  const index = new Map<string, Set<FileWordRef>>();

  for (const file of files) {
    // #region START_INDEX_FILE_TAG — invariant: words from @file: field
    const fileWords = extractWords(file.header.file);
    for (const w of fileWords) {
      addRef(index, w, { file: file.absPath, source: 'file' });
    }
    // #endregion END_INDEX_FILE_TAG

    // #region START_INDEX_ENTITY_PURPOSE — invariant: words from @purpose of each entity
    for (const exp of file.exports) {
      const purposeEntry = exp.contract.entries.find(
        (e) => e.type === 'purpose' || e.type === 'description'
      );
      if (!purposeEntry) continue;
      const entityWords = extractWords(purposeEntry.value);
      for (const w of entityWords) {
        addRef(index, w, { file: file.absPath, source: 'entity', entity: exp.name });
      }
    }
    // #endregion END_INDEX_ENTITY_PURPOSE
  }

  return index;
}

function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length > 1);
}

function addRef(index: Map<string, Set<FileWordRef>>, word: string, ref: FileWordRef): void {
  let refs = index.get(word);
  if (!refs) {
    refs = new Set();
    index.set(word, refs);
  }
  refs.add(ref);
}
