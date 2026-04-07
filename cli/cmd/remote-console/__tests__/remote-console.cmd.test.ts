import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  composeRemoteConsoleActivationUrl,
  parseRemoteConsoleCommandArgs,
  runRemoteConsoleCommand,
} from '../remote-console.cmd.ts';
import type { RemoteConsoleServerLifecycle } from '../../../../services/remote-console/server/remote-console-server.types.ts';

/**
 * remote-console.cmd Test Graph:
 * ├── CLI integration
 * │   ├── should register remote-console command in routing and help outputs
 * │   ├── should open URL with activation flag when --url is provided
 * │   └── should not open browser when --url is absent
 * │
 * └── URL mutation
 *     └── should preserve existing query parameters and hash fragment
 */
describe('remote-console.cmd', () => {
  it('should register remote-console command in routing and help outputs', async () => {
    // START_CLI_REGISTRATION_ARRANGE_SOURCES
    const [gennadySource, helpSource] = await Promise.all([
      import('node:fs/promises').then((fs) => fs.readFile('cli/gennady.ts', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile('cli/cmd/help/help.cmd.ts', 'utf8')),
    ]);
    // END_CLI_REGISTRATION_ARRANGE_SOURCES

    // START_CLI_REGISTRATION_ACT
    const registrationState = {
      hasRouterCase: gennadySource.includes("case 'remote-console':"),
      hasCommandImport: gennadySource.includes('./cmd/remote-console/index.ts'),
      hasHelpLine: helpSource.includes('remote-console'),
    };
    // END_CLI_REGISTRATION_ACT

    // START_CLI_REGISTRATION_ASSERT
    assert.deepStrictEqual(registrationState, {
      hasRouterCase: true,
      hasCommandImport: true,
      hasHelpLine: true,
    });
    // END_CLI_REGISTRATION_ASSERT
  });

  it('should open URL with activation flag when --url is provided', async () => {
    // START_CLI_OPEN_URL_ARRANGE_RUNTIME
    const openCalls: string[] = [];
    const startedServers: Array<{ port: number; host?: string }> = [];
    const infoMessages: string[] = [];
    const serverHandle: RemoteConsoleServerLifecycle = {
      url: 'http://127.0.0.1:44000/',
      close: async () => undefined,
    };
    // END_CLI_OPEN_URL_ARRANGE_RUNTIME

    // START_CLI_OPEN_URL_ACT
    await runRemoteConsoleCommand(
      [
        'node',
        'cli/gennady.ts',
        'remote-console',
        '--port=44000',
        '--url=https://example.test/path?foo=1',
      ],
      {
        startServer: async (options) => {
          startedServers.push({ port: options.port, host: options.host });
          return serverHandle;
        },
        openBrowser: async (targetUrl) => {
          openCalls.push(targetUrl);
        },
        info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
        warn: () => undefined,
      }
    );
    // END_CLI_OPEN_URL_ACT

    // START_CLI_OPEN_URL_ASSERT
    assert.deepStrictEqual(
      {
        startedServers,
        openCalls,
        infoMessageCount: infoMessages.length,
      },
      {
        startedServers: [{ port: 44000, host: undefined }],
        openCalls: ['https://example.test/path?foo=1&__remote_console__=1'],
        infoMessageCount: 3,
      }
    );
    // END_CLI_OPEN_URL_ASSERT
  });

  it('should preserve existing query parameters and hash fragment', () => {
    // START_CLI_URL_MUTATION_ARRANGE_INPUT
    const sourceUrl = 'https://example.test/path?foo=1#hash-fragment';
    // END_CLI_URL_MUTATION_ARRANGE_INPUT

    // START_CLI_URL_MUTATION_ACT
    const mutatedUrl = composeRemoteConsoleActivationUrl(sourceUrl);
    // END_CLI_URL_MUTATION_ACT

    // START_CLI_URL_MUTATION_ASSERT
    assert.deepStrictEqual(
      mutatedUrl,
      'https://example.test/path?foo=1&__remote_console__=1#hash-fragment'
    );
    // END_CLI_URL_MUTATION_ASSERT
  });

  it('should not open browser when --url is absent', async () => {
    // START_CLI_NO_OPEN_ARRANGE_RUNTIME
    const openCalls: string[] = [];
    const serverHandle: RemoteConsoleServerLifecycle = {
      url: 'http://127.0.0.1:44001/',
      close: async () => undefined,
    };
    // END_CLI_NO_OPEN_ARRANGE_RUNTIME

    // START_CLI_NO_OPEN_ACT
    await runRemoteConsoleCommand(['node', 'cli/gennady.ts', 'remote-console'], {
      startServer: async () => serverHandle,
      openBrowser: async (targetUrl) => {
        openCalls.push(targetUrl);
      },
      info: () => undefined,
      warn: () => undefined,
    });
    const args = parseRemoteConsoleCommandArgs(['node', 'cli/gennady.ts', 'remote-console']);
    // END_CLI_NO_OPEN_ACT

    // START_CLI_NO_OPEN_ASSERT
    assert.deepStrictEqual(
      {
        openCalls,
        args,
      },
      {
        openCalls: [],
        args: { port: undefined, host: undefined, url: undefined },
      }
    );
    // END_CLI_NO_OPEN_ASSERT
  });
});
