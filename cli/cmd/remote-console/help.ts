// @file: remote-console command help output
// @consumers: help command
/**
 * @purpose Print CLI help for the remote-console command.
 */
export function printHelp(): void {
  console.info('gennady remote-console — Mirror browser console output into local stdout');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady remote-console [options]');
  console.info('');
  console.info('Options:');
  console.info('  --port, -p <port>   Server port (default: 43001)');
  console.info('  --host <host>       Server bind host (default: localhost)');
  console.info('  --url <URL>         Page URL to open with remote-console activation');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady remote-console');
  console.info('  npx gennady remote-console --port=8080');
  console.info('  npx gennady remote-console --url="https://example.com"');
}
