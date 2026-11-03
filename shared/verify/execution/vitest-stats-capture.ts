// @file: Bounded streaming validation of runner-owned JSON while retaining only top-level Vitest counters.
// @spec: CLI-VERIFY
// @consumers: Verify local executor

import { StringDecoder } from 'node:string_decoder';

type Frame = {
  kind: 'object' | 'array';
  state: 'first-key' | 'key' | 'colon' | 'first-value' | 'value' | 'after';
  key?: string;
};
const COUNTERS = new Set([
  'numTotalTests',
  'numPassedTests',
  'numFailedTests',
  'numPendingTests',
  'numTodoTests',
]);

/**
 * @purpose Validate a complete JSON object without retaining its potentially huge testResults payload.
 * @invariant Memory is bounded by 128 frames, one short token/key and five counters, not report size.
 * @invariant Incomplete, malformed, duplicate-counter or trailing non-whitespace input never yields counters.
 */
export class VitestStatsCapture {
  /** @purpose Incremental UTF8 decoding across process chunks. */
  #decoder = new StringDecoder('utf8');
  /** @purpose Bounded container grammar stack. */
  #stack: Frame[] = [];
  /** @purpose Only validated root test counters. */
  #counts: Record<string, number> = {};
  /** @purpose Whether the JSON report has begun. */
  #started = false;
  /** @purpose Whether the root object was fully closed. */
  #done = false;
  /** @purpose Permanent fail-closed parse state. */
  #invalid = false;
  /** @purpose Current token category. */
  #mode: 'syntax' | 'string' | 'primitive' = 'syntax';
  /** @purpose Bounded key or primitive token. */
  #token = '';
  /** @purpose Whether the current string is an object key. */
  #keyToken = false;
  /** @purpose Unknown long keys are discarded without retaining their bytes. */
  #longKey = false;
  /** @purpose Pending JSON string escape. */
  #escape = false;
  /** @purpose Remaining hexadecimal digits in a Unicode escape. */
  #unicode = 0;

  /**
   * @purpose Consume one stdout chunk from this exact process.
   * @param chunk Raw process bytes.
   */
  write(chunk: Buffer): void {
    if (this.#invalid) return;
    for (const character of this.#decoder.write(chunk)) this.#consume(character);
  }

  /**
   * @purpose Finish validation and materialize only the bounded counters object.
   * @returns Compact JSON, or null when the complete stream does not prove valid counters.
   */
  finish(): string | null {
    for (const character of this.#decoder.end()) this.#consume(character);
    if (this.#invalid || !this.#done || this.#mode !== 'syntax') return null;
    if (![...COUNTERS].slice(0, 4).every((key) => key in this.#counts)) return null;
    return JSON.stringify(this.#counts);
  }

  /**
   * @purpose Mark one scalar/container as consumed in its parent grammar state.
   * @param [value] Scalar value, or undefined for a container/string.
   */
  #value(value?: number | null | boolean): void {
    const frame = this.#stack.at(-1);
    if (!frame || (frame.state !== 'value' && frame.state !== 'first-value')) {
      this.#invalid = true;
      return;
    }
    if (this.#stack.length === 1 && frame.key && COUNTERS.has(frame.key)) {
      if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        frame.key in this.#counts
      )
        this.#invalid = true;
      else this.#counts[frame.key] = value;
    }
    frame.state = 'after';
  }

  /**
   * @purpose Validate a primitive token without accepting JSON-like numeric extensions.
   */
  #primitive(): void {
    if (!/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(this.#token)) {
      this.#invalid = true;
      return;
    }
    this.#value(JSON.parse(this.#token) as number | null | boolean);
    this.#mode = 'syntax';
    this.#token = '';
  }

  /**
   * @purpose Consume one validated string character without retaining string values.
   * @param character Next decoded character.
   */
  #string(character: string): void {
    if (this.#keyToken && !this.#longKey) {
      this.#token += character;
      if (this.#token.length > 256) {
        this.#token = '';
        this.#longKey = true;
      }
    }
    if (this.#unicode > 0) {
      if (!/^[0-9a-f]$/i.test(character)) this.#invalid = true;
      this.#unicode -= 1;
    } else if (this.#escape) {
      if (character === 'u') this.#unicode = 4;
      else if (!'"\\/bfnrt'.includes(character)) this.#invalid = true;
      this.#escape = false;
    } else if (character === '\\') this.#escape = true;
    else if (character === '"') {
      const frame = this.#stack.at(-1)!;
      if (this.#keyToken) {
        frame.key = this.#longKey
          ? undefined
          : (JSON.parse('"' + this.#token.slice(0, -1) + '"') as string);
        frame.state = 'colon';
      } else this.#value();
      this.#mode = 'syntax';
      this.#token = '';
    } else if (character.charCodeAt(0) < 32) this.#invalid = true;
  }

  /**
   * @purpose Advance the bounded JSON grammar, allowing npm's pre-object prolog only.
   * @param character Next decoded character.
   */
  #consume(character: string): void {
    if (this.#invalid) return;
    if (this.#mode === 'string') {
      this.#string(character);
      return;
    }
    if (this.#mode === 'primitive') {
      if (/^[\s,}\]]$/.test(character)) {
        this.#primitive();
        this.#consume(character);
      } else if (this.#token.length >= 64) this.#invalid = true;
      else this.#token += character;
      return;
    }
    if (!this.#started) {
      if (character === '{') {
        this.#started = true;
        this.#stack.push({ kind: 'object', state: 'first-key' });
      }
      return;
    }
    if (/^[\x20\t\r\n]$/.test(character)) return;
    if (this.#done) {
      this.#invalid = true;
      return;
    }
    const frame = this.#stack.at(-1)!;
    if (character === '}' || character === ']') {
      const empty = frame.kind === 'object' ? 'first-key' : 'first-value';
      if (
        (frame.kind === 'object') !== (character === '}') ||
        (frame.state !== empty && frame.state !== 'after')
      )
        this.#invalid = true;
      else {
        this.#stack.pop();
        if (this.#stack.length === 0) this.#done = true;
      }
      return;
    }
    if (frame.state === 'after') {
      if (character !== ',') this.#invalid = true;
      else frame.state = frame.kind === 'object' ? 'key' : 'value';
      return;
    }
    if (frame.state === 'colon') {
      if (character !== ':') this.#invalid = true;
      else frame.state = 'value';
      return;
    }
    const key = frame.state === 'key' || frame.state === 'first-key';
    if (character === '"') {
      this.#mode = 'string';
      this.#keyToken = key;
      this.#longKey = false;
      this.#token = '';
      this.#escape = false;
      this.#unicode = 0;
    } else if (key) this.#invalid = true;
    else if (character === '{' || character === '[') {
      this.#value();
      if (this.#stack.length >= 128) this.#invalid = true;
      else
        this.#stack.push({
          kind: character === '{' ? 'object' : 'array',
          state: character === '{' ? 'first-key' : 'first-value',
        });
    } else if (/^[-0-9tfn]$/.test(character)) {
      this.#mode = 'primitive';
      this.#token = character;
    } else this.#invalid = true;
  }
}
