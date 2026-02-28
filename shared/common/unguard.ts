/**
 * @purpose Синхронно развернуть result tuple.
 * @param resultTuple Кортеж [result, error]; при error — бросает его.
 * @returns Развёрнутый результат при успехе.
 * @throws Error из resultTuple[1] при наличии; SyntaxError при невалидном формате.
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
 * @purpose Развернуть result (tuple или Promise<tuple>); при error — бросает.
 * @param resultOrPromise Кортеж [result, error] или Promise такого кортежа; при error в tuple — бросает его.
 * @returns Promise с развёрнутым результатом при успехе.
 * @throws Error из tuple при наличии; SyntaxError при невалидном формате (см. unguard).
 */
export const unguardOrThrow = async <TResult>(
  resultOrPromise: [TResult, null] | [null, Error] | Promise<[TResult, null] | [null, Error]>
): Promise<TResult> => {
  const result = await resultOrPromise;
  return unguard<TResult>(result);
};
