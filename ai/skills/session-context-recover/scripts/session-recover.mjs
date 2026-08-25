#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const HOME = homedir();
const MAX_TEXT = 2400;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) continue;
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) options[token.slice(2)] = true;
    else { options[token.slice(2)] = value; index += 1; }
  }
  return { command, options };
}

function walk(root, predicate, maxDepth = 8, depth = 0, output = []) {
  if (!existsSync(root) || depth > maxDepth) return output;
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) walk(path, predicate, maxDepth, depth + 1, output);
    else if (predicate(path)) output.push(path);
  }
  return output;
}

function safeJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; }
}

function matchScore(query, candidate) {
  const q = query.toLocaleLowerCase();
  const c = String(candidate ?? '').toLocaleLowerCase();
  if (c === q) return 100;
  if (c.includes(q)) return 80;
  const words = q.split(/\s+/).filter(Boolean);
  return words.length ? Math.round(words.filter((word) => c.includes(word)).length / words.length * 60) : 0;
}

function findClaudeTranscript(sessionId) {
  return walk(join(HOME, '.claude', 'projects'), (path) => basename(path) === `${sessionId}.jsonl`, 3)[0];
}

function locateClaude(query) {
  const root = join(HOME, 'Library', 'Application Support', 'Claude', 'claude-code-sessions');
  const results = [];
  for (const metadataPath of walk(root, (path) => path.endsWith('.json'), 5)) {
    const data = safeJson(metadataPath);
    if (!data) continue;
    const score = Math.max(matchScore(query, data.title), matchScore(query, data.cliSessionId), matchScore(query, data.sessionId));
    if (!score) continue;
    results.push({
      provider: 'claude', titleMatchScore: score, title: data.title, id: data.cliSessionId ?? data.sessionId,
      desktopSessionId: data.sessionId, metadataPath,
      transcriptPath: data.cliSessionId ? findClaudeTranscript(data.cliSessionId) : undefined,
      cwd: data.cwd, originCwd: data.originCwd, worktreePath: data.worktreePath,
      branch: data.branch, sourceBranch: data.sourceBranch,
      createdAt: data.createdAt, updatedAt: data.lastActivityAt, archived: data.isArchived,
    });
  }
  if (!results.length && /^[0-9a-f-]{36}$/i.test(query)) {
    const transcriptPath = findClaudeTranscript(query);
    if (transcriptPath) results.push({ provider: 'claude', titleMatchScore: 100, id: query, transcriptPath });
  }
  return results;
}

function sqlite(database, query) {
  return execFileSync('sqlite3', ['-readonly', '-json', database, query], { encoding: 'utf8' });
}

function locateOpenCode(query) {
  const databasePath = join(HOME, '.local', 'share', 'opencode', 'opencode.db');
  if (!existsSync(databasePath)) return [];
  const escaped = query.replaceAll("'", "''");
  const rows = JSON.parse(sqlite(databasePath, `SELECT id,title,time_created AS createdAt,time_updated AS updatedAt FROM session WHERE id='${escaped}' OR lower(title) LIKE lower('%${escaped}%') ORDER BY time_updated DESC LIMIT 20;`) || '[]');
  return rows.map((row) => ({ provider: 'opencode', titleMatchScore: Math.max(matchScore(query, row.title), matchScore(query, row.id)), ...row, databasePath }));
}

function locateCodex(query) {
  const databasePath = join(HOME, '.codex', 'state_5.sqlite');
  if (existsSync(databasePath)) {
    const escaped = query.replaceAll("'", "''");
    try {
      const rows = JSON.parse(sqlite(databasePath, `SELECT id,title,name,cwd,rollout_path AS transcriptPath,git_branch AS branch,git_sha AS gitSha,created_at AS createdAt,updated_at AS updatedAt,archived FROM threads WHERE id='${escaped}' OR lower(name)=lower('${escaped}') OR lower(title)=lower('${escaped}') OR lower(name) LIKE lower('%${escaped}%') OR lower(title) LIKE lower('%${escaped}%') ORDER BY CASE WHEN lower(name)=lower('${escaped}') THEN 0 WHEN lower(title)=lower('${escaped}') THEN 1 ELSE 2 END, updated_at DESC LIMIT 20;`) || '[]');
      if (rows.length) return rows.map((row) => ({
        ...row, provider: 'codex', databasePath, catalogTitle: row.title, title: row.name || row.title,
        titleMatchScore: Math.max(matchScore(query, row.name), matchScore(query, row.title), matchScore(query, row.id)),
      }));
    } catch {}
  }
  const results = [];
  for (const root of [join(HOME, '.codex', 'sessions'), join(HOME, '.codex', 'archived_sessions')]) {
    for (const path of walk(root, (file) => file.endsWith('.jsonl'), 6)) {
      if (basename(path).includes(query)) results.push({ provider: 'codex', titleMatchScore: 90, id: basename(path, '.jsonl'), transcriptPath: path });
    }
  }
  return results;
}

function locate(provider, query) {
  if (!query) fail('locate requires --query <title-or-id>');
  const names = provider === 'auto' ? ['claude', 'opencode', 'codex'] : [provider];
  const results = names.flatMap((name) => {
    if (name === 'claude') return locateClaude(query);
    if (name === 'opencode') return locateOpenCode(query);
    if (name === 'codex') return locateCodex(query);
    fail(`Unsupported provider: ${name}`);
  }).sort((a, b) => b.titleMatchScore - a.titleMatchScore || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const bestScore = results[0]?.titleMatchScore ?? 0;
  const relevant = bestScore === 100 ? results.filter((item) => item.titleMatchScore === 100) : results.filter((item) => item.titleMatchScore >= Math.max(20, bestScore - 30));
  const seen = new Set();
  return relevant.filter((item) => {
    const key = `${item.provider}:${item.id}:${item.title ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function clip(value, limit = MAX_TEXT) {
  const text = String(value ?? '').replaceAll('\u0000', '').trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}… [truncated ${text.length - limit} chars]`;
}

function messageText(message) {
  if (typeof message?.content === 'string') return message.content;
  if (!Array.isArray(message?.content)) return '';
  return message.content.filter((part) => part?.type === 'text').map((part) => part.text ?? '').join('\n');
}

function toolCalls(message) {
  if (!Array.isArray(message?.content)) return [];
  return message.content.filter((part) => part?.type === 'tool_use').map((part) => ({
    name: part.name, id: part.id,
    input: Object.fromEntries(Object.entries(part.input ?? {}).map(([key, value]) => [key, clip(typeof value === 'string' ? value : JSON.stringify(value), 600)])),
  }));
}

function labels(text) {
  const found = [];
  for (const [name, pattern] of Object.entries({
    decision: /решил|решение|выбираем|договорил|decision|agreed/i,
    problem: /ошиб|проблем|не работает|failed|failure|error|blocked|блокер/i,
    completion: /готово|заверш|done|complete|implemented|исправлено/i,
    verification: /тест|провер|verify|build|lint|typecheck/i,
    requirement: /нужно|важно|должен|требован|must|should|require/i,
  })) if (pattern.test(text)) found.push(name);
  return found;
}

function bounded(items, limit, priority = () => false) {
  if (items.length <= limit) return items;
  const chosen = new Map();
  for (const item of items.filter(priority).slice(-Math.floor(limit / 2))) chosen.set(item.line, item);
  for (const item of items.slice(0, Math.floor(limit / 6))) chosen.set(item.line, item);
  for (const item of items.slice(-Math.floor(limit / 3))) chosen.set(item.line, item);
  const remaining = limit - chosen.size;
  if (remaining > 0) {
    const step = items.length / remaining;
    for (let index = 0; index < remaining; index += 1) {
      const item = items[Math.floor(index * step)];
      chosen.set(item.line, item);
    }
  }
  return [...chosen.values()].sort((a, b) => a.line - b.line).slice(-limit);
}

async function evidenceClaude(candidate) {
  const path = candidate.transcriptPath ?? findClaudeTranscript(candidate.id);
  if (!path) fail(`Claude transcript not found for ${candidate.id}`);
  const operatorMessages = [];
  const assistantNarrative = [];
  const actions = [];
  const toolResults = [];
  const counts = {};
  let lineNumber = 0;
  let malformedLines = 0;
  let compactSummaries = 0;
  let shutdownInterruptions = 0;
  let lastTimestamp;
  let lastType;
  const allToolUseIds = new Set();
  const allToolResultIds = new Set();
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    lineNumber += 1;
    let row;
    try { row = JSON.parse(line); } catch { malformedLines += 1; continue; }
    lastTimestamp = row.timestamp ?? lastTimestamp;
    lastType = row.type ?? lastType;
    if (row.isCompactSummary) compactSummaries += 1;
    if (row.interruptedByShutdown) shutdownInterruptions += 1;
    const message = row.message ?? row;
    const role = message.role;
    const text = messageText(message);
    const calls = toolCalls(message);
    const type = row.type ?? (role ? 'message' : 'event');
    counts[type] = (counts[type] ?? 0) + 1;
    const eventLabels = labels(text);
    const base = { line: lineNumber, timestamp: row.timestamp, uuid: row.uuid, parentUuid: row.parentUuid };
    const hasToolResult = Array.isArray(message.content) && message.content.some((part) => part?.type === 'tool_result');
    if (role === 'user' && !hasToolResult && text) {
      operatorMessages.push({ ...base, compactSummary: Boolean(row.isCompactSummary), meta: Boolean(row.isMeta), labels: eventLabels, text: clip(text, 1000) });
    }
    if (role === 'assistant' && text && eventLabels.length) {
      assistantNarrative.push({ ...base, labels: eventLabels, text: clip(text, 800) });
    }
    for (const call of calls) {
      allToolUseIds.add(call.id);
      actions.push({ ...base, tool: call.name, toolUseId: call.id, input: call.input });
    }
    if (hasToolResult) {
      for (const part of message.content.filter((item) => item?.type === 'tool_result')) {
        allToolResultIds.add(part.tool_use_id);
        const resultText = typeof part.content === 'string' ? part.content : JSON.stringify(part.content ?? '');
        const isError = Boolean(part.is_error) || /(^|\n)(error|failed|fatal|exit code [1-9])/i.test(resultText);
        toolResults.push({ ...base, toolUseId: part.tool_use_id, isError, text: clip(resultText, isError ? 1000 : 300) });
      }
    }
  }
  const selectedNarrative = bounded(assistantNarrative, 260, (item) => item.labels.includes('problem') || item.labels.includes('decision'));
  const selectedActions = bounded(actions, 500, (item) => /Write|Edit|Bash|Task|Agent/i.test(item.tool));
  const selectedResults = bounded(toolResults, 220, (item) => item.isError);
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), provider: 'claude', session: candidate,
    transcript: { path, bytes: statSync(path).size, lines: lineNumber, malformedLines, counts },
    terminalState: {
      lastLine: lineNumber, lastTimestamp, lastRecordType: lastType, compactSummaries, shutdownInterruptions,
      unresolvedToolUseIds: [...allToolUseIds].filter((id) => !allToolResultIds.has(id)).slice(-50),
      unresolvedToolUseCount: [...allToolUseIds].filter((id) => !allToolResultIds.has(id)).length,
    },
    evidencePolicy: { maxTextChars: MAX_TEXT, fullTranscriptLoadedIntoPrompt: false, selection: 'all operator messages; bounded assistant narrative, actions, and tool results; errors prioritized' },
    operatorMessages,
    assistantNarrative: selectedNarrative,
    actions: selectedActions,
    toolResults: selectedResults,
    omitted: { assistantNarrative: assistantNarrative.length - selectedNarrative.length, actions: actions.length - selectedActions.length, toolResults: toolResults.length - selectedResults.length },
    tail: [...operatorMessages, ...selectedNarrative, ...selectedActions, ...selectedResults].sort((a, b) => a.line - b.line).slice(-30),
  };
}

function evidenceOpenCode(candidate) {
  const databasePath = candidate.databasePath ?? join(HOME, '.local', 'share', 'opencode', 'opencode.db');
  const id = candidate.id.replaceAll("'", "''");
  const rows = JSON.parse(sqlite(databasePath, `SELECT m.id AS messageId,json_extract(m.data,'$.role') AS role,m.time_created AS timestamp,json_extract(p.data,'$.type') AS partType,json_extract(p.data,'$.text') AS text FROM part p JOIN message m ON p.message_id=m.id WHERE m.session_id='${id}' ORDER BY m.time_created LIMIT 5000;`) || '[]');
  const events = rows.filter((row) => row.text).map((row, index) => ({ line: index + 1, ...row, labels: labels(row.text), text: clip(row.text, row.role === 'user' ? 1000 : 800) }));
  const operatorMessages = events.filter((event) => event.role === 'user');
  const assistantNarrative = bounded(events.filter((event) => event.role === 'assistant' && event.labels.length), 260, (event) => event.labels.includes('problem') || event.labels.includes('decision'));
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), provider: 'opencode', session: candidate,
    transcript: { databasePath, rows: rows.length },
    terminalState: { lastLine: events.at(-1)?.line, lastTimestamp: events.at(-1)?.timestamp, unresolvedToolUseIds: [], unresolvedToolUseCount: 0 },
    evidencePolicy: { maxTextChars: MAX_TEXT, fullTranscriptLoadedIntoPrompt: false, selection: 'all operator messages; bounded labeled assistant narrative; text parts only' },
    operatorMessages, assistantNarrative, actions: [], toolResults: [],
    omitted: { assistantNarrative: events.filter((event) => event.role === 'assistant' && event.labels.length).length - assistantNarrative.length, actions: 0, toolResults: 0 },
    tail: events.slice(-30),
  };
}

async function evidenceCodex(candidate) {
  const path = candidate.transcriptPath;
  if (!path || !existsSync(path)) fail(`Codex transcript not found for ${candidate.id}`);
  const operatorMessages = [];
  const assistantCandidates = [];
  const actions = [];
  const toolResults = [];
  const turnWorkdirs = new Set();
  const counts = {};
  let lineNumber = 0;
  let malformedLines = 0;
  let lastTimestamp;
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    lineNumber += 1;
    let row;
    try { row = JSON.parse(line); } catch { malformedLines += 1; continue; }
    lastTimestamp = row.timestamp ?? lastTimestamp;
    counts[row.type] = (counts[row.type] ?? 0) + 1;
    const payload = row.payload ?? {};
    if (row.type === 'turn_context' && payload.cwd) turnWorkdirs.add(payload.cwd);
    const base = { line: lineNumber, timestamp: row.timestamp, id: payload.id };
    if (payload.type === 'message') {
      const text = (payload.content ?? []).filter((part) => part.type === 'input_text' || part.type === 'output_text').map((part) => part.text ?? '').join('\n');
      const eventLabels = labels(text);
      if (payload.role === 'user' && text) operatorMessages.push({ ...base, labels: eventLabels, text: clip(text, 1000) });
      if (payload.role === 'assistant' && text && eventLabels.length) assistantCandidates.push({ ...base, labels: eventLabels, text: clip(text, 800) });
    }
    if (payload.type === 'custom_tool_call' || payload.type === 'function_call') {
      const rawInput = payload.input ?? payload.arguments ?? '';
      actions.push({ ...base, tool: payload.name, toolUseId: payload.call_id, input: clip(typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput), 600) });
    }
    if (payload.type === 'custom_tool_call_output' || payload.type === 'function_call_output') {
      const output = typeof payload.output === 'string' ? payload.output : JSON.stringify(payload.output ?? '');
      const isError = /(^|\n)(error|failed|fatal|exit code [1-9]|script failed)/i.test(output);
      toolResults.push({ ...base, toolUseId: payload.call_id, isError, text: clip(output, isError ? 1000 : 300) });
    }
  }
  const assistantNarrative = bounded(assistantCandidates, 260, (event) => event.labels.includes('problem') || event.labels.includes('decision'));
  const selectedActions = bounded(actions, 500);
  const selectedResults = bounded(toolResults, 220, (event) => event.isError);
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), provider: 'codex', session: candidate,
    transcript: { path, bytes: statSync(path).size, lines: lineNumber, malformedLines, counts },
    terminalState: { lastLine: lineNumber, lastTimestamp, turnWorkdirs: [...turnWorkdirs] },
    workspaceBinding: { recoveredWorkdir: candidate.cwd, recoveredBranch: candidate.branch, recoveredGitSha: candidate.gitSha, observedTurnWorkdirs: [...turnWorkdirs], mismatch: [...turnWorkdirs].some((cwd) => candidate.cwd && cwd !== candidate.cwd) },
    evidencePolicy: { maxTextChars: MAX_TEXT, fullTranscriptLoadedIntoPrompt: false, selection: 'all operator messages; bounded assistant narrative, actions, and tool results; errors prioritized' },
    operatorMessages, assistantNarrative, actions: selectedActions, toolResults: selectedResults,
    omitted: { assistantNarrative: assistantCandidates.length - assistantNarrative.length, actions: actions.length - selectedActions.length, toolResults: toolResults.length - selectedResults.length },
    tail: [...operatorMessages, ...assistantNarrative, ...selectedActions, ...selectedResults].sort((a, b) => a.line - b.line).slice(-30),
  };
}

function inspectWorkspace(path) {
  const target = resolve(path);
  if (!existsSync(target)) return { path: target, exists: false };
  const result = { path: target, exists: true, isDirectory: statSync(target).isDirectory() };
  try {
    result.git = {
      topLevel: execFileSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(),
      branch: execFileSync('git', ['-C', target, 'branch', '--show-current'], { encoding: 'utf8' }).trim(),
      head: execFileSync('git', ['-C', target, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      status: execFileSync('git', ['-C', target, 'status', '--short', '--branch'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
    };
  } catch (error) { result.git = { error: clip(error.stderr || error.message) }; }
  return result;
}

function guardWorkspace(options) {
  if (!options.path) fail('guard requires --path <directory>');
  const observed = inspectWorkspace(options.path);
  const checks = {
    exists: observed.exists === true,
    topLevel: !options.root || observed.git?.topLevel === resolve(options.root),
    branch: !options.branch || observed.git?.branch === options.branch,
    head: !options.head || observed.git?.head === options.head,
  };
  return { bindingOk: Object.values(checks).every(Boolean), expected: { path: resolve(options.path), root: options.root ? resolve(options.root) : undefined, branch: options.branch, head: options.head }, observed, checks };
}

function evidenceView(pack, view) {
  if (!view || view === 'full') return pack;
  const common = { schemaVersion: pack.schemaVersion, generatedAt: pack.generatedAt, provider: pack.provider, session: pack.session, transcript: pack.transcript, terminalState: pack.terminalState, workspaceBinding: pack.workspaceBinding, evidencePolicy: pack.evidencePolicy, omitted: pack.omitted };
  if (view === 'intent') return {
    ...common, view,
    operatorMessages: pack.operatorMessages,
    assistantNarrative: pack.assistantNarrative.filter((item) => item.labels.includes('decision') || item.labels.includes('requirement')).slice(-80),
    tail: pack.tail.slice(-15),
  };
  if (view === 'execution') return {
    ...common, view,
    assistantNarrative: pack.assistantNarrative.filter((item) => item.labels.some((label) => ['problem', 'completion', 'verification'].includes(label))).slice(-80),
    actions: pack.actions.slice(-180), toolResults: pack.toolResults.slice(-100), tail: pack.tail.slice(-15),
  };
  if (view === 'audit') return {
    ...common, view,
    operatorMessages: [...pack.operatorMessages.slice(0, 20), ...pack.operatorMessages.slice(-50)],
    assistantNarrative: pack.assistantNarrative.filter((item) => item.labels.includes('completion') || item.labels.includes('problem')).slice(-100),
    failedToolResults: pack.toolResults.filter((item) => item.isError), tail: pack.tail.slice(-15),
  };
  fail(`Unknown evidence view: ${view}`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || options.help) {
    process.stdout.write('Usage:\n  session-recover.mjs locate --provider auto|claude|opencode|codex --query <title-or-id>\n  session-recover.mjs evidence --provider <provider> --id <id> [--view full|intent|execution|audit] [--output file]\n  session-recover.mjs workspace --path <directory>\n  session-recover.mjs guard --path <directory> [--root <git-root>] [--branch <branch>] [--head <sha>]\n');
    return;
  }
  if (command === 'locate') return void process.stdout.write(`${JSON.stringify(locate(options.provider ?? 'auto', options.query), null, 2)}\n`);
  if (command === 'workspace') {
    if (!options.path) fail('workspace requires --path <directory>');
    return void process.stdout.write(`${JSON.stringify(inspectWorkspace(options.path), null, 2)}\n`);
  }
  if (command === 'guard') {
    const result = guardWorkspace(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.bindingOk) process.exitCode = 2;
    return;
  }
  if (command === 'evidence') {
    if (!options.id) fail('evidence requires --id <session-id>');
    const candidates = locate(options.provider ?? 'auto', options.id);
    const candidate = candidates.find((item) => item.id === options.id) ?? candidates[0];
    if (!candidate) fail(`Session not found: ${options.id}`);
    let pack;
    if (candidate.provider === 'claude') pack = await evidenceClaude(candidate);
    else if (candidate.provider === 'opencode') pack = evidenceOpenCode(candidate);
    else if (candidate.provider === 'codex') pack = await evidenceCodex(candidate);
    else fail(`Unsupported evidence provider: ${candidate.provider}`);
    const serialized = `${JSON.stringify(evidenceView(pack, options.view), null, 2)}\n`;
    if (options.output) writeFileSync(resolve(options.output), serialized);
    else process.stdout.write(serialized);
    return;
  }
  fail(`Unknown command: ${command}`);
}

main().catch((error) => fail(error.stack || error.message));
