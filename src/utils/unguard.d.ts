/** Synchronously unwraps a result tuple #UNGUARD_FUNCTION */
declare function unguard<TResult>(result: [TResult, null] | [null, Error]): TResult;

/** Asynchronously unwraps a result, which can be either a direct tuple `[result, error]` #UNGUARD_OR_THROW_FUNCTION */
declare function unguardOrThrow<TResult>(
    resultOrPromise: [TResult, null] | [null, Error] | Promise<[TResult, null] | [null, Error]>
): Promise<TResult>;

export { unguard, unguardOrThrow };
