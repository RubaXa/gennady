// @file: Unit tests for inbox-core AuditLog — append, query, rotation at 10MB.
// @consumers: node:test runner
// @tasks: TSK-109

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { AuditLog, type AuditEntry } from '../audit-log.ts';

let tmpDir: string;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'inbox-core-audit-test-'));
  await mkdir(join(tmpDir, 'agent-inbox'), { recursive: true });
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('AuditLog — append + query', () => {
  let auditDir: string;

  beforeEach(async () => {
    auditDir = await mkdtemp(join(tmpDir, 'sub-'));
    await mkdir(join(auditDir, 'agent-inbox'), { recursive: true });
  });

  it('append добавляет запись в audit.jsonl', async () => {
    const audit = new AuditLog(auditDir);
    const entry: AuditEntry = {
      ts: '2026-01-01T00:00:00Z',
      mr: 'https://example.com/1',
      role: 'reviewer',
      event: 'classified',
      detail: 'stage=review_needed',
    };

    await audit.append(entry);

    const content = await readFile(audit.logPath, 'utf-8');
    const parsed = JSON.parse(content.trim());
    assert.strictEqual(parsed.mr, 'https://example.com/1');
    assert.strictEqual(parsed.event, 'classified');
  });

  it('query возвращает события для конкретного MR', async () => {
    const audit = new AuditLog(auditDir);
    await audit.append({
      ts: '2026-01-01T00:00:00Z',
      mr: 'https://example.com/mr1',
      role: 'reviewer',
      event: 'classified',
    });
    await audit.append({
      ts: '2026-01-02T00:00:00Z',
      mr: 'https://example.com/mr2',
      role: 'author',
      event: 'posted',
    });
    await audit.append({
      ts: '2026-01-03T00:00:00Z',
      mr: 'https://example.com/mr1',
      role: 'reviewer',
      event: 'approved',
    });

    const results = await audit.query('https://example.com/mr1');
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].event, 'classified');
    assert.strictEqual(results[1].event, 'approved');
  });

  it('query возвращает пустой массив для неизвестного MR', async () => {
    const audit = new AuditLog(auditDir);
    await audit.append({
      ts: '2026-01-01T00:00:00Z',
      mr: 'https://example.com/mr1',
      role: 'reviewer',
      event: 'classified',
    });

    const results = await audit.query('https://example.com/unknown');
    assert.strictEqual(results.length, 0);
  });

  it('append нескольких событий → все строки в файле', async () => {
    const audit = new AuditLog(auditDir);
    for (let i = 0; i < 5; i++) {
      await audit.append({
        ts: `2026-01-0${i + 1}T00:00:00Z`,
        mr: 'https://example.com/1',
        role: 'reviewer',
        event: `event-${i}`,
      });
    }

    const content = await readFile(audit.logPath, 'utf-8');
    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 5);
  });
});

describe('AuditLog — ротация 10MB', () => {
  let auditDir: string;

  beforeEach(async () => {
    auditDir = await mkdtemp(join(tmpDir, 'rot-'));
    await mkdir(join(auditDir, 'agent-inbox'), { recursive: true });
  });

  it('rotate перемещает audit.jsonl в audit.1.jsonl', async () => {
    const audit = new AuditLog(auditDir);
    await audit.append({
      ts: '2026-01-01T00:00:00Z',
      mr: 'https://example.com/1',
      role: 'reviewer',
      event: 'test-rotate',
    });

    assert.ok(existsSync(audit.logPath));
    await audit.rotate();

    assert.ok(!existsSync(audit.logPath));
    const rotatedPath = `${join(auditDir, 'agent-inbox', 'audit')}.1.jsonl`;
    assert.ok(existsSync(rotatedPath));

    const content = await readFile(rotatedPath, 'utf-8');
    const parsed = JSON.parse(content.trim());
    assert.strictEqual(parsed.event, 'test-rotate');
  });

  it('rotate на несуществующем файле → no-op', async () => {
    const audit = new AuditLog(auditDir);
    await audit.rotate();
  });

  it('rotate выбирает следующий доступный номер при множественных ротациях', async () => {
    const audit = new AuditLog(auditDir);

    await audit.append({
      ts: '2026-01-01T00:00:00Z',
      mr: 'https://x/1',
      role: 'reviewer',
      event: 'first',
    });
    await audit.rotate(); // → audit.1.jsonl

    await audit.append({
      ts: '2026-01-02T00:00:00Z',
      mr: 'https://x/1',
      role: 'reviewer',
      event: 'second',
    });
    await audit.rotate(); // → audit.2.jsonl

    assert.ok(existsSync(`${join(auditDir, 'agent-inbox', 'audit')}.1.jsonl`));
    assert.ok(existsSync(`${join(auditDir, 'agent-inbox', 'audit')}.2.jsonl`));
  });

  it('query читает события из текущего и всех ротированных файлов', async () => {
    const audit = new AuditLog(auditDir);

    await audit.append({
      ts: '2026-01-01T00:00:00Z',
      mr: 'https://x/1',
      role: 'reviewer',
      event: 'event-1',
    });
    await audit.rotate();

    await audit.append({
      ts: '2026-01-02T00:00:00Z',
      mr: 'https://x/1',
      role: 'reviewer',
      event: 'event-2',
    });

    const results = await audit.query('https://x/1');
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].event, 'event-1');
    assert.strictEqual(results[1].event, 'event-2');
  });

  it('rotateIfNeeded не ротирует маленький файл', async () => {
    const audit = new AuditLog(auditDir);
    await audit.append({
      ts: '2026-01-01T00:00:00Z',
      mr: 'https://x/1',
      role: 'reviewer',
      event: 'small',
    });
    assert.ok(existsSync(audit.logPath));

    // rotateIfNeeded on small file — should NOT rotate
    await audit.rotateIfNeeded();
    assert.ok(existsSync(audit.logPath));
    assert.ok(!existsSync(`${join(auditDir, 'agent-inbox', 'audit')}.1.jsonl`));
  });
});
