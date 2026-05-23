// @file: Domain errors for agent-mon provider registry
// @consumers: monitor
// @tasks: TSK-35

/** @purpose Raised when attempting to register a provider with a key already in use. */
export class DuplicateProviderError extends Error {
  /** @purpose The conflicting provider key */
  readonly key: string;

  /**
   * @purpose Construct with the duplicate key and a trace-prefixed message.
   * @param key The provider key that is already registered.
   */
  constructor(key: string) {
    super(`[DuplicateProviderError] Provider with key "${key}" is already registered`);
    this.name = 'DuplicateProviderError';
    this.key = key;
  }
}

/** @purpose Raised when attempting to access a provider that is not registered. */
export class ProviderNotFoundError extends Error {
  /** @purpose The missing provider key */
  readonly key: string;

  /**
   * @purpose Construct with the missing key and a trace-prefixed message.
   * @param key The provider key that was not found.
   */
  constructor(key: string) {
    super(`[ProviderNotFoundError] Provider with key "${key}" is not registered`);
    this.name = 'ProviderNotFoundError';
    this.key = key;
  }
}
