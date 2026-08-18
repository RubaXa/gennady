// @file: Describe AI model configuration in rc-file (name, URL, optional key).
// @consumers: ai-legacy-core
// @tasks: N/A

import { readFileSync, existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';

/**
 * @purpose Describe AI model configuration in rc-file (name, URL, optional key).
 * @consumer GennadyRc, ai-legacy
 */
export type RcModel = {
  /** @purpose Model identifier string (e.g. 'deepseek-v4-pro'). */
  model: string;
  /** @purpose Base URL of the model API endpoint. */
  url: string;
  /** @purpose Optional API key for authenticated requests. */
  key?: string;
};

/**
 * @purpose Root configuration data structure for Gennady RC (model list + stack section).
 * @consumer GennadyRc
 */
export type GennadyRcData = {
  /** @purpose List of configured AI models. */
  models: RcModel[];
  /** @purpose Stack plugin configuration section; validated by services/stack/stack-config. */
  stack?: unknown;
};

/**
 * @purpose Load and parse Gennady configuration from rc-file in a given directory.
 * @invariant On read/parse error _error is populated; getModels() returns an empty array.
 * @sideEffect IO: file read at constructor.
 * @consumer ai-legacy, CLI agent
 */
export class GennadyRc {
  /** @purpose Default configuration filename. */
  static DEFAULT_FILENAME = '.gennadyrc';

  /**
   * @purpose Create GennadyRc instances for current directory and HOME (lookup priority).
   * @returns Array of two instances: [cwd, HOME].
   * @sideEffect IO: file read at constructor.
   */
  static getDefaults(): GennadyRc[] {
    return [process.cwd(), process.env.HOME].map((dir) => new GennadyRc(dir));
  }

  /** @purpose Full path to the loaded rc config file. */
  protected _filename = '';
  /** @purpose Parsed configuration data with model list. */
  protected _data: GennadyRcData = {
    models: [],
  };
  /** @purpose Load/parse error if config is invalid, null otherwise. */
  protected _error: Error | null = null;

  /**
   * @purpose Load and parse Gennady RC config file from a directory.
   * @param [dir] Directory to look for the rc file in (defaults to cwd).
   * @param [name] Config filename (defaults to .gennadyrc).
   */
  constructor(dir = process.cwd(), name = GennadyRc.DEFAULT_FILENAME) {
    this._filename = pathJoin(dir, name);

    try {
      if (existsSync(this._filename)) {
        const data = JSON.parse(readFileSync(this._filename).toString()) as unknown;

        if (Array.isArray(data)) {
          this._data.models = data as RcModel[];
        } else if (data && typeof data === 'object' && !Array.isArray(data)) {
          // Sections are independent: `models` may be absent when only `stack`
          // (or another section) is configured. A present `models` must be an array.
          const candidate = data as Partial<GennadyRcData>;
          if (candidate.models !== undefined && !Array.isArray(candidate.models)) {
            this._error = new Error(
              `[GENNADY_RC_ERROR_CONFIG] Invalid "models" in "${this._filename}" config`,
              { cause: data }
            );
          } else {
            this._data = {
              ...this._data,
              ...candidate,
              models: candidate.models ?? this._data.models,
            };
          }
        } else {
          this._error = new Error(
            `[GENNADY_RC_ERROR_CONFIG] Invalid "${this._filename}" config data`,
            { cause: data }
          );
        }
      }
    } catch (err) {
      this._error = new Error(`[GENNADY_RC_ERROR_PARSE] Read "${this._filename}" config failed`, {
        cause: err,
      });
    }
  }

  /**
   * @purpose Check that configuration was successfully loaded and recognized.
   * @returns true if no error; false on parse error or invalid data.
   */
  isValid(): boolean {
    return !this._error;
  }

  /**
   * @purpose Get list of models from loaded rc.
   * @returns Array of RcModel (empty on error or missing file).
   */
  getModels(): RcModel[] {
    return this._data.models;
  }

  /**
   * @purpose Get the raw stack section from loaded rc; shape validation is the caller's job.
   * @returns Unvalidated stack section, or undefined when absent.
   */
  getStack(): unknown {
    return this._data.stack;
  }

  /**
   * @purpose Get load/parse error if one occurred.
   * @returns Error or null on successful load.
   */
  getError(): Error | null {
    return this._error;
  }
}
