import { describe, test, mock } from 'node:test';
import assert from 'node:assert';
import { AiModel } from './ai-model.js';

const defaultInit = {
    model: 'test-model',
    url: 'http://localhost/api',
    key: 'test-key',
};

describe('AiModel', () => {
    describe('constructor & getters', () => {
        test('model, url, key', () => {
            const ai = new AiModel(defaultInit);
            assert.strictEqual(ai.name, defaultInit.model);
            assert.strictEqual(ai.url, defaultInit.url);
            assert.strictEqual(ai.key, defaultInit.key);
        });
    });

    describe('generate()', () => {
        test('response with .response field', async () => {
            const mockedFetch = mock.method(global, 'fetch', async () => ({
                ok: true,
                json: async () => ({ response: 'hello' })
            }));
            try {
                const ai = new AiModel(defaultInit);
                const [result, error] = await ai.generate('prompt');
                assert.strictEqual(error, null);
                assert.strictEqual(result, 'hello');
            } finally {
                mockedFetch.mock.restore();
            }
        });

        test('response with choices[0].message', async () => {
            const mockedFetch = mock.method(global, 'fetch', async () => ({
                ok: true,
                json: async () => ({ choices: [{ message: { content: 'hi!' } }] })
            }));
            try {
                const ai = new AiModel({ ...defaultInit, url: 'http://localhost/api/completions' });
                const [result, error] = await ai.generate('prompt');
                assert.strictEqual(error, null);
                assert.strictEqual(result, 'hi!');
            } finally {
                mockedFetch.mock.restore();
            }
        });

        test('unexpected structure', async () => {
            const mockedFetch = mock.method(global, 'fetch', async () => ({
                ok: true,
                json: async () => ({ foo: 'bar' })
            }));
            try {
                const ai = new AiModel(defaultInit);
                const [result, error] = await ai.generate('prompt');
                assert(error instanceof Error);
                assert.strictEqual(result, null);
                assert(String(error.message).includes('Response structure unexpected'));
            } finally {
                mockedFetch.mock.restore();
            }
        });
    });

    describe('ping()', () => {
        test('returns true if model responds OK', async () => {
            const mockedFetch = mock.method(global, 'fetch', async () => ({
                ok: true,
                json: async () => ({ response: 'OK' })
            }));
            try {
                const ai = new AiModel(defaultInit);
                const [ok, err] = await ai.ping();
                assert.strictEqual(err, null);
                assert.strictEqual(ok, true);
            } finally {
                mockedFetch.mock.restore();
            }
        });

        test('returns false if model responds NOT OK', async () => {
            const mockedFetch = mock.method(global, 'fetch', async () => ({
                ok: true,
                json: async () => ({ response: 'NOPE' })
            }));
            try {
                const ai = new AiModel(defaultInit);
                const [ok, err] = await ai.ping();
                assert.strictEqual(err, null);
                assert.strictEqual(ok, false);
            } finally {
                mockedFetch.mock.restore();
            }
        });

        test('returns error if fetch fails', async () => {
            const mockedFetch = mock.method(global, 'fetch', async () => { throw new Error('fail'); });
            try {
                const ai = new AiModel(defaultInit);
                const [ok, err] = await ai.ping();
                assert(err instanceof Error);
                assert.strictEqual(ok, null);
                assert(`${err}`.includes('Ping failed'));
            } finally {
                mockedFetch.mock.restore();
            }
        });
    });
});
