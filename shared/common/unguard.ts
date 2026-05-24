// @file: Synchronously unwrap a result tuple.
// @consumers: ai-legacy-agent, ai-legacy-core, ai-legacy-model
// @tasks: N/A

/**
 * @purpose Synchronously unwrap a result tuple.
 * @throws Error from resultTuple[1] if present; SyntaxError for invalid format.
 */
export const unguard = <TResult>(result: unknown): TResult => {
  if (Array.isArray(result) && result.length === 2) {
    const error = result[1];

    if (error === null) {
      return result[0] as TResult;
    } else {
      throw error instanceof Error
        ? error
        : new TypeError(`[UNGUARD_ERROR_TYPE] Error "${error}"`, { cause: error });
    }
  }

  throw new SyntaxError(
    '[UNGUARD_ERROR_SYNTAX] Invalid input: not a valid [result, error] tuple.',
    { cause: result }
  );
};

/**
 * @purpose Unwrap result (tuple or Promise\<tuple\>); throws on error.
 * @throws Error from tuple if present; SyntaxError for invalid format (see unguard).
 */
export const unguardOrThrow = async <TResult>(
  resultOrPromise: [TResult, null] | [null, Error] | Promise<[TResult, null] | [null, Error]>
): Promise<TResult> => {
  const result = await resultOrPromise;
  return unguard<TResult>(result);
};
