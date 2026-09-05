// @file: Shared must-remember workspace boundary appended to agent-facing SDD state outputs.
// @consumers: sdd-state, sdd-task, sdd-new

import { join, resolve } from 'node:path';

/**
 * @purpose Append one bright, terminal workspace boundary to an agent-facing state report.
 * @param text State report produced by the owning command.
 * @param workingDirectory Sole directory where the worker may read or modify project artifacts.
 * @returns State report ending with absolute WORKING_DIR/TMP_DIR fields and the mandatory reminder.
 */
export function appendSddSessionBoundary(text: string, workingDirectory: string): string {
  const workingDir = resolve(workingDirectory);
  const tmpDir = join(workingDir, '.tmp');
  return [
    text,
    '',
    '[!!! SESSION BOUNDARY — MUST REMEMBER !!!]',
    `WORKING_DIR=${workingDir}`,
    `TMP_DIR=${tmpDir}`,
    'обязательные к запоминанию поля: WORKING_DIR, TMP_DIR',
    'ЗАПОМНИ НА ВСЮ СЕССИЮ: работаешь только в WORKING_DIR; читать/писать вне WORKING_DIR и TMP_DIR запрещено; искать примеры вне них запрещено.',
  ].join('\n');
}
