import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GennadyRc } from './rc-config.js';

let tempDir;

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gennadyrc-test-'));
});

afterEach(() => {
    try {
        rmSync(tempDir, { recursive: true, force: true });
    } catch {}
});

describe('GennadyRC', () => {
    test('Valid config: object with models', () => {
        const config = { models: [{ model: 'test-model', url: 'http://localhost' }] };
        const file = join(tempDir, '.gennadyrc');
        writeFileSync(file, JSON.stringify(config));
        const rc = new GennadyRc(tempDir);
        assert.strictEqual(rc.isValid(), true, 'Config should be valid');
        assert.deepStrictEqual(rc.getModels(), config.models, 'Models should match');
    });

    test('Legacy config: array of models', () => {
        const config = [{ model: 'legacy', url: 'http://legacy' }];
        const file = join(tempDir, '.gennadyrc');
        writeFileSync(file, JSON.stringify(config));
        const rc = new GennadyRc(tempDir);
        assert.strictEqual(rc.isValid(), true, 'Legacy config should be valid');
        assert.deepStrictEqual(rc.getModels(), config, 'Legacy models should match');
    });

    test('Invalid JSON', () => {
        const file = join(tempDir, '.gennadyrc');
        writeFileSync(file, '{ invalid json');
        const rc = new GennadyRc(tempDir);
        assert.strictEqual(rc.isValid(), false, 'Config with invalid JSON should be invalid');
        assert(rc.getError() instanceof Error, 'Should have error');
    });

    test('Invalid structure: object without models', () => {
        const config = { foo: 'bar' };
        const file = join(tempDir, '.gennadyrc');
        writeFileSync(file, JSON.stringify(config));
        const rc = new GennadyRc(tempDir);
        assert.strictEqual(rc.isValid(), false, 'Config without models should be invalid');
        assert(rc.getError() instanceof Error, 'Should have error');
    });

    test('Missing file', () => {
        const rc = new GennadyRc(tempDir);
        assert.strictEqual(rc.isValid(), true, 'Config should be valid if file is missing');
        assert.deepStrictEqual(rc.getModels(), [], 'Models should be empty if file is missing');
    });
});