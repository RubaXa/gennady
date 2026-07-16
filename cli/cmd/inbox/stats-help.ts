// @file: inbox stats command help output.
// @consumers: gennady.ts
// @tasks: TSK-perf

/** @purpose Print CLI help for the inbox stats command. */
export function printHelp(): void {
  console.info('gennady inbox stats — Аналитика по времени ревью (phase-timings.jsonl)');
  console.info('');
  console.info('Usage:');
  console.info('  gennady inbox stats [options]');
  console.info('');
  console.info('Options:');
  console.info('  --days <n>            Окно анализа в днях (default 7)');
  console.info('  --json                Печатать сырой PhaseAnalytics как JSON');
  console.info('  --path                Печатать путь к phase-timings.jsonl');
  console.info('  --help                Show this help');
  console.info('  --state-dir <dir>     State directory (default ~/.gennady)');
  console.info('');
  console.info('Читает <state-dir>/agent-inbox/telemetry/phase-timings.jsonl (append-only JSONL,');
  console.info('одна плоская запись на исполненную session-ноду) и выводит per-node p50/p95/avg/');
  console.info('error-rate, per-run итоги и самую медленную фазу за окно.');
}
