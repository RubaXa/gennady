// @file: D-23 pre-write guard for the first v2 package sync over an SDD v1 consumer.
// @spec: CLI-SYNC
// @consumers: sync.cmd.ts, sync-skills.cmd.ts

import { statSync } from 'node:fs';
import { join } from 'node:path';
import { detectFlowVersion } from '../../sdd/flow.ts';

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * @purpose Refuse a destructive first v2 sync over a repository whose canonical layout is still
 *   SDD v1, before either sync command writes a byte (SO-12/D-23).
 * @param root Consumer repository root used by the sync command.
 * @returns A complete operator-facing refusal when `tasks/` marks v1; otherwise `null`.
 */
export function v1ConsumerSyncRefusal(root: string): string | null {
  if (detectFlowVersion(root) === 'v2') return null;
  const manifest = join(root, '.claude', 'skills', '.gennady-synced');
  const manifestHint = isFile(manifest)
    ? `Найден ${manifest}; это только манифест владения sync и не доказательство миграции SDD.`
    : `Файл ${manifest} не найден; прежнее владение файлами sync неизвестно.`;
  return [
    'Error: синхронизация SDD v2 остановлена до записи файлов.',
    `Найдено: ${join(root, 'tasks')} — канонический маркер SDD v1.`,
    'Причина: наложение v2-директив и v2-скиллов на живое v1-дерево оставит смешанный, неоднозначный consumer.',
    manifestHint,
    'Что сделать: сначала выполните `npx gennady sdd-migrate bootstrap .`, проверьте dry-run и повторите с `--write`.',
    'Bootstrap безопасно заменит только доказанно package-owned V1 tooling и установит свежий runtime миграции; затем выполните шаги из `migration/README.md`.',
    'Повторите sync только когда `npx gennady sdd-state .` сообщает `FLOW_VERSION=v2` и каталог `tasks/` отсутствует.',
  ].join('\n');
}
