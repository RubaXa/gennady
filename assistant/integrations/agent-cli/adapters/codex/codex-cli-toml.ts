/**
 * @purpose Сериализация McpServerConfig[] в TOML для Codex config.toml.
 * @consumer CodexCliAdapter
 */

import type { McpServerConfig } from '../../core/agent-cli-options.type.ts';

function escapeTomlString(s: string): string {
  if (/[\n"\\]/.test(s))
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  return `"${s}"`;
}

/**
 * @purpose Собирает TOML-секцию mcp.servers для конфига Codex.
 * @param servers Список MCP-серверов.
 * @returns Строка TOML ([[mcp.servers]] с command, args, env).
 */
export function serializeMcpServersToToml(servers: McpServerConfig[]): string {
  const lines: string[] = [];
  for (const s of servers) {
    lines.push('[[mcp.servers]]');
    lines.push(`id = ${escapeTomlString(s.id)}`);
    lines.push(`command = ${escapeTomlString(s.command)}`);
    if (s.args && s.args.length > 0) {
      lines.push(`args = [${s.args.map((a) => escapeTomlString(a)).join(', ')}]`);
    }
    if (s.env && Object.keys(s.env).length > 0) {
      lines.push('[mcp.servers.env]');
      for (const [k, v] of Object.entries(s.env)) {
        lines.push(`${k} = ${escapeTomlString(v)}`);
      }
    }
  }
  return lines.join('\n');
}
