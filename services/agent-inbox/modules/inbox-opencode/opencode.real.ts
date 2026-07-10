// @file: OpenCodeReal — production adapter implementing OpenCodePort via @opencode-ai/sdk.
// @consumers: SessionPool (production), DI container, inbox-roles
// @tasks: TSK-112

import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import type { TextPart } from '@opencode-ai/sdk';
import { logger } from '#logger';
import {
  OpenCodePort,
  type SessionHandle,
  type CreateSessionOpts,
  type PromptOpts,
  type SessionStatus,
} from './opencode.port.ts';
import { composeOk, composeError, type OpenCodeCallResult } from './errors.ts';

/** @purpose Configuration for the OpenCodeReal adapter. */
export type OpenCodeRealOpts = {
  /** @purpose Base URL of the running opencode server (default: http://localhost:4096). */
  baseUrl?: string;
  /** @purpose Default working directory for all sessions (optional — can be set per-session). */
  directory?: string;
  /** @purpose Prompt timeout in milliseconds (default: 300_000 = 5min). */
  timeout?: number;
};

/**
 * @purpose Production adapter that delegates all OpenCodePort operations to a real
 *          opencode server through @opencode-ai/sdk (HTTP client mode).
 * @implements {OpenCodePort} in ./opencode.port.ts
 * @invariant Connects to an existing `opencode serve` instance.
 * @invariant When format is requested: embeds JSON schema in system prompt,
 *           extracts JSON from response text as fallback (SDK v1.x lacks
 *           native json_schema support).
 * @consumer DI container (replaces OpenCodeMock in production)
 */
export class OpenCodeReal extends OpenCodePort {
  /** @purpose Base URL of the opencode server. */
  protected _baseUrl: string;
  /** @purpose Default directory for session binding. */
  protected _directory: string | undefined;
  /** @purpose Prompt timeout. */
  protected _timeout: number;
  /** @purpose Lazily initialized SDK client — created on first use. */
  protected _client: OpencodeClient | null;
  /** @purpose Track session directory mappings (sid → directory) for per-session binding. */
  protected _sessionDirs: Map<string, string>;

  /**
   * @purpose Create an OpenCodeReal adapter bound to a running opencode server.
   * @param [opts] Connection options — baseUrl, default directory, timeout.
   */
  constructor(opts: OpenCodeRealOpts = {}) {
    super();
    this._baseUrl = opts.baseUrl ?? 'http://localhost:4096';
    this._directory = opts.directory;
    this._timeout = opts.timeout ?? 300_000; // 5-minute default
    this._client = null;
    this._sessionDirs = new Map();
    logger.debug('[OpenCodeReal#ctor] [created]', { baseUrl: this._baseUrl });
  }

  /**
   * @purpose Lazily initialise the SDK client on first use.
   * @returns The SDK client instance.
   * @sideEffect Creates a new OpencodeClient if not already created.
   */
  protected _ensureClient(): OpencodeClient {
    if (!this._client) {
      this._client = createOpencodeClient({
        baseUrl: this._baseUrl,
        directory: this._directory,
      });
      logger.debug('[OpenCodeReal#_ensureClient] [client created]', {
        baseUrl: this._baseUrl,
        directory: this._directory,
      });
    }
    return this._client;
  }

  // ── createSession ──────────────────────────────────────────────

  /**
   * @param opts Session title and directory.
   * @throws Wraps network errors as OpenCodeCallResult-style errors.
   * @returns Session handle with server-assigned id.
   * @see {OpenCodePort#createSession}
   */
  async createSession(opts: CreateSessionOpts): Promise<SessionHandle> {
    const client = this._ensureClient();
    const directory = opts.directory || this._directory;

    // #region START_CREATE_SESSION — POST /session with title and directory
    try {
      logger.debug('[OpenCodeReal#createSession] [creating]', {
        title: opts.title,
        directory,
      });

      const result = await client.session.create({
        body: { title: opts.title },
        query: directory ? { directory } : undefined,
      });

      if (result.error) {
        const errMsg =
          typeof result.error === 'object' && 'message' in result.error
            ? String((result.error as { message: unknown }).message)
            : 'Session creation failed';
        logger.warn('[OpenCodeReal#createSession] [server error]', {
          title: opts.title,
          error: errMsg,
        });
        throw new Error(`OpenCodeReal: createSession failed — ${errMsg}`);
      }

      const session = result.data!;
      this._sessionDirs.set(session.id, directory ?? session.directory);

      logger.debug('[OpenCodeReal#createSession] [created]', {
        sid: session.id,
        title: session.title,
      });

      return {
        sid: session.id,
        title: session.title,
        directory: directory ?? session.directory,
        status: 'idle',
      };
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.error('[OpenCodeReal#createSession] [unavailable]', {
        title: opts.title,
        message: cause.message,
      });
      throw cause;
    }
    // #endregion END_CREATE_SESSION
  }

  // ── prompt ────────────────────────────────────────────────────

  /**
   * @param sid Session identifier.
   * @param opts System message, user text, and optional format schema.
   * @returns Discriminated result — ok: true with output or ok: false with error.
   * @see {OpenCodePort#prompt}
   */
  async prompt(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    return this._sendPrompt(sid, opts);
  }

  // ── status ────────────────────────────────────────────────────

  /**
   * @param sid Session identifier.
   * @returns Current lifecycle status mapped from SDK SessionStatus.
   * @see {OpenCodePort#status}
   */
  async status(sid: string): Promise<SessionStatus> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;

    // #region START_STATUS — GET /session/status → map SDK type to port status
    try {
      logger.debug('[OpenCodeReal#status] [querying]', { sid });

      const result = await client.session.status({
        query: directory ? { directory } : undefined,
      });

      if (result.error) {
        logger.warn('[OpenCodeReal#status] [server error → terminated]', { sid });
        return 'terminated';
      }

      const statusMap = result.data;
      if (!statusMap || !(sid in statusMap)) {
        // Session not found in status map — may be completed or terminated.
        // Try session.get() to distinguish.
        try {
          await client.session.get({
            path: { id: sid },
            query: directory ? { directory } : undefined,
          });
          // Session exists but not in status → idle/completed
          return 'idle';
        } catch {
          return 'terminated';
        }
      }

      const sdkStatus = statusMap[sid]!;

      // #region START_MAP_STATUS — SDK SessionStatus type → port SessionStatus
      switch (sdkStatus.type) {
        case 'busy':
          return 'running';
        case 'retry':
          return 'error';
        case 'idle':
        default:
          return 'idle';
      }
      // #endregion END_MAP_STATUS
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.warn('[OpenCodeReal#status] [error → terminated]', {
        sid,
        message: cause.message,
      });
      return 'terminated';
    }
    // #endregion END_STATUS
  }

  // ── continueSignal ────────────────────────────────────────────

  /**
   * @param sid Session identifier.
   * @param opts Remediation prompt.
   * @returns Discriminated result.
   * @see {OpenCodePort#continueSignal}
   */
  async continueSignal(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    return this._sendPrompt(sid, opts);
  }

  // ── abort ─────────────────────────────────────────────────────

  /**
   * @param sid Session identifier.
   * @returns Promise that resolves when abort completes.
   * @sideEffect Calls POST /session/{id}/abort on the server.
   * @see {OpenCodePort#abort}
   */
  async abort(sid: string): Promise<void> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;

    // #region START_ABORT — POST /session/{id}/abort
    try {
      logger.debug('[OpenCodeReal#abort] [aborting]', { sid });

      const result = await client.session.abort({
        path: { id: sid },
        query: directory ? { directory } : undefined,
      });

      if (result.error) {
        logger.warn('[OpenCodeReal#abort] [server error]', { sid, error: result.error });
      } else {
        logger.debug('[OpenCodeReal#abort] [aborted]', { sid });
      }
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.warn('[OpenCodeReal#abort] [error — ignored]', {
        sid,
        message: cause.message,
      });
    }
    // #endregion END_ABORT
  }

  // ── close ─────────────────────────────────────────────────────

  /**
   * @param sid Session identifier.
   * @returns Promise that resolves when close completes.
   * @sideEffect Calls DELETE /session/{id} to release server resources.
   * @see {OpenCodePort#close}
   */
  async close(sid: string): Promise<void> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;

    // #region START_CLOSE — DELETE /session/{id}
    try {
      logger.debug('[OpenCodeReal#close] [closing]', { sid });

      const result = await client.session.delete({
        path: { id: sid },
        query: directory ? { directory } : undefined,
      });

      if (result.error) {
        logger.warn('[OpenCodeReal#close] [server error]', { sid, error: result.error });
      } else {
        logger.debug('[OpenCodeReal#close] [closed]', { sid });
      }
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.warn('[OpenCodeReal#close] [error — ignored]', {
        sid,
        message: cause.message,
      });
    } finally {
      this._sessionDirs.delete(sid);
    }
    // #endregion END_CLOSE
  }

  // ═══════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * @purpose Core prompt logic: builds request body with system, text, optional JSON format.
   * Extracts JSON from response when format is specified.
   * @param sid Session identifier.
   * @param opts Prompt options.
   * @returns Discriminated call result.
   */
  protected async _sendPrompt(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;
    const hasFormat = !!opts.format;

    // #region START_BUILD_PROMPT_BODY — compose system + text parts
    let system = opts.system ?? '';
    const parts: Array<{ type: 'text'; text: string }> = [];

    // When format is requested, embed schema instructions in the system prompt.
    // SDK v1.x does not expose a native `format: json_schema` parameter —
    // fallback: instruct the model to return JSON in a code block.
    if (hasFormat && opts.format) {
      const schemaJson = JSON.stringify(opts.format.schema, null, 2);
      const formatInstruction = [
        '',
        '--- STRUCTURED OUTPUT INSTRUCTIONS ---',
        'You MUST respond with a single valid JSON object that matches the following JSON Schema.',
        'Wrap your JSON response in a ```json code block.',
        'Do NOT include any other text outside the code block.',
        '',
        '```json-schema',
        schemaJson,
        '```',
        '',
        'Example response format:',
        '```json',
        JSON.stringify(this._generateExample(opts.format.schema), null, 2),
        '```',
        '--- END STRUCTURED OUTPUT INSTRUCTIONS ---',
      ].join('\n');

      system = system ? `${system}\n${formatInstruction}` : formatInstruction;
    }

    if (opts.text) {
      parts.push({ type: 'text', text: opts.text });
    }
    // #endregion END_BUILD_PROMPT_BODY

    try {
      logger.debug('[OpenCodeReal#_sendPrompt] [prompting]', {
        sid,
        hasFormat,
        systemLength: system.length,
        partsCount: parts.length,
      });

      const result = await client.session.prompt({
        body: {
          system: system || undefined,
          parts: parts as Array<{ type: 'text'; text: string }>,
        },
        path: { id: sid },
        query: directory ? { directory } : undefined,
      });

      if (result.error) {
        const errData = result.error as { name?: string; data?: { message?: string } } | undefined;
        const errName = errData?.name ?? 'UnknownError';
        const errMsg = errData?.data?.message ?? 'Prompt failed';

        logger.warn('[OpenCodeReal#_sendPrompt] [server error]', {
          sid,
          error: errName,
          message: errMsg,
        });

        // #region START_CLASSIFY_SERVER_ERROR
        if (errName === 'MessageAbortedError') {
          return composeError('SESSION_ERROR', `Session ${sid} was aborted: ${errMsg}`);
        }
        if (errName === 'APIError') {
          const statusCode = errData?.data && (errData.data as Record<string, unknown>).statusCode;
          if (statusCode === 404) {
            return composeError('SESSION_ERROR', `Session ${sid} not found on server (404)`);
          }
        }
        return composeError('SESSION_ERROR', `Server error: ${errName} — ${errMsg}`);
        // #endregion END_CLASSIFY_SERVER_ERROR
      }

      const response = result.data!;
      const assistantInfo = response.info;
      const responseParts = response.parts;

      // Check if the assistant message itself has an error
      if (assistantInfo.error) {
        const msgErr = assistantInfo.error;
        logger.warn('[OpenCodeReal#_sendPrompt] [assistant error]', {
          sid,
          errorName: msgErr.name,
        });

        if (msgErr.name === 'MessageAbortedError') {
          return composeError('SESSION_ERROR', `Session ${sid} was aborted`);
        }
        if (msgErr.name === 'MessageOutputLengthError') {
          return composeError(
            'INCOMPLETE_ARTIFACT',
            `Output for session ${sid} exceeded length limit`,
            { raw: '' }
          );
        }
        return composeError(
          'SESSION_ERROR',
          `Assistant error: ${msgErr.name} — ${(msgErr.data as { message?: string } | undefined)?.message ?? 'unknown'}`
        );
      }

      // #region START_EXTRACT_TEXT — collect all TextPart text from response
      const texts: string[] = [];
      for (const part of responseParts) {
        if (part.type === 'text') {
          const textPart = part as TextPart;
          if (textPart.text && !textPart.ignored) {
            texts.push(textPart.text);
          }
        }
      }
      const fullText = texts.join('\n');
      // #endregion END_EXTRACT_TEXT

      // If no format requested, return text as output
      if (!hasFormat) {
        logger.debug('[OpenCodeReal#_sendPrompt] [completed — text]', {
          sid,
          textLength: fullText.length,
        });
        return composeOk({ text: fullText, raw: fullText });
      }

      // Priority 1: extract JSON from ```json ... ``` code blocks
      const jsonBlockRegex = /```(?:json)\s*\n?([\s\S]*?)```/g;
      const jsonBlocks: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = jsonBlockRegex.exec(fullText)) !== null) {
        jsonBlocks.push(match[1]!.trim());
      }

      // Priority 2: try parsing the entire text as JSON
      if (jsonBlocks.length === 0) {
        const trimmed = fullText.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          jsonBlocks.push(trimmed);
        }
      }

      if (jsonBlocks.length === 0) {
        logger.warn('[OpenCodeReal#_sendPrompt] [no JSON in response]', {
          sid,
          textPreview: fullText.slice(0, 200),
        });
        return composeError('NO_RESULT', 'No JSON found in AI response', {
          raw: fullText.slice(0, 2000),
        });
      }

      // Try each JSON block — use the last one (most likely the structured output)
      const lastBlock = jsonBlocks[jsonBlocks.length - 1]!;
      let parsed: unknown;
      try {
        parsed = JSON.parse(lastBlock);
      } catch {
        logger.warn('[OpenCodeReal#_sendPrompt] [parse error]', {
          sid,
          blockPreview: lastBlock.slice(0, 200),
        });
        return composeError('PARSE_ERROR', 'Failed to parse JSON from AI response', {
          raw: lastBlock,
        });
      }

      // Validate against schema if provided
      if (opts.format?.schema) {
        const schemaErrors = this._validateSchema(
          opts.format.schema as Record<string, unknown>,
          parsed as Record<string, unknown>
        );
        if (schemaErrors.length > 0) {
          logger.warn('[OpenCodeReal#_sendPrompt] [schema mismatch]', {
            sid,
            errors: schemaErrors,
          });
          return composeError(
            'SCHEMA_MISMATCH',
            `Output does not match expected schema: ${schemaErrors.join('; ')}`,
            {
              mismatchedFields: schemaErrors,
              expected: opts.format.schema,
              received: parsed as Record<string, unknown>,
            }
          );
        }
      }

      logger.debug('[OpenCodeReal#_sendPrompt] [completed — structured]', { sid });
      return composeOk(parsed as Record<string, unknown>);
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));

      // #region START_CLASSIFY_NETWORK_ERROR — connection refused, timeout, etc.
      const message = cause.message.toLowerCase();
      if (
        message.includes('econnrefused') ||
        message.includes('fetch failed') ||
        message.includes('connection refused')
      ) {
        logger.error('[OpenCodeReal#_sendPrompt] [unavailable]', {
          sid,
          message: cause.message,
        });
        return composeError('SESSION_ERROR', `OpenCode server unavailable: ${cause.message}`);
      }

      if (message.includes('timeout') || message.includes('abort')) {
        logger.error('[OpenCodeReal#_sendPrompt] [timeout]', {
          sid,
          message: cause.message,
        });
        return composeError('TIMEOUT', `Prompt timed out: ${cause.message}`);
      }

      logger.error('[OpenCodeReal#_sendPrompt] [unexpected error]', {
        sid,
        message: cause.message,
      });
      return composeError('SESSION_ERROR', `Unexpected error: ${cause.message}`);
      // #endregion END_CLASSIFY_NETWORK_ERROR
    }
  }

  /**
   * @purpose Generate a plausible example JSON from a JSON Schema for the prompt.
   * @param schema The JSON Schema to generate an example from.
   * @returns An example object matching the schema structure.
   */
  protected _generateExample(schema: Record<string, unknown>): Record<string, unknown> {
    const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
    const required = (schema.required as string[]) ?? [];
    const example: Record<string, unknown> = {};

    for (const [key, propSchema] of Object.entries(properties)) {
      const type = propSchema.type as string | undefined;
      switch (type) {
        case 'string':
          example[key] = key === 'id' ? 'example-id' : `example-${key}`;
          break;
        case 'number':
        case 'integer':
          example[key] = 0;
          break;
        case 'boolean':
          example[key] = false;
          break;
        case 'array':
          example[key] = [];
          break;
        case 'object':
          example[key] = {};
          break;
        default:
          // For enums: use first value
          if (Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
            example[key] = propSchema.enum[0];
          } else {
            example[key] = null;
          }
      }
    }

    // Ensure required fields are present even if not in properties
    for (const reqKey of required) {
      if (!(reqKey in example)) {
        example[reqKey] = 'required-value';
      }
    }

    return example;
  }

  /**
   * @purpose Perform basic structural validation of parsed JSON against a schema.
   * Checks required fields and primitive type matching. Not a full JSON Schema validator.
   * @param schema The expected JSON Schema.
   * @param data The parsed JSON data to validate.
   * @returns Array of human-readable error messages (empty = valid).
   */
  protected _validateSchema(
    schema: Record<string, unknown>,
    data: Record<string, unknown>
  ): string[] {
    const errors: string[] = [];
    const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
    const required = (schema.required as string[]) ?? [];

    // Check required fields exist
    for (const reqKey of required) {
      if (!(reqKey in data) || data[reqKey] === undefined || data[reqKey] === null) {
        errors.push(`required field "${reqKey}" is missing or null`);
      }
    }

    // Check types for present fields
    for (const [key, propSchema] of Object.entries(properties)) {
      if (!(key in data) || data[key] === undefined) continue;

      const value = data[key];
      const expectedType = propSchema.type as string | undefined;

      if (expectedType) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (expectedType === 'integer') {
          if (typeof value !== 'number' || !Number.isInteger(value)) {
            errors.push(`field "${key}" expected integer, got ${typeof value}`);
          }
        } else if (expectedType !== actualType) {
          // Allow null for non-required fields
          if (value !== null || required.includes(key)) {
            errors.push(`field "${key}" expected ${expectedType}, got ${actualType}`);
          }
        }
      }
    }

    return errors;
  }
}
