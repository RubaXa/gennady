/**
 * Synchronously unwraps a result tuple.
 * If the tuple is malformed or indicates an error (assuming the error is already an Error instance),
 * this function throws that error. Otherwise, it returns the successful result.
 *
 * @template TResult The type of the result expected if the tuple represents a successful outcome.
 *
 * @param {unknown} resultTuple - The input, expected to be a tuple `[result, error]`.
 *   Specifically, `[TResult, null]` for success, or `[null, Error]` for failure.
 *
 * @returns {TResult} The unwrapped result if the tuple represents a successful outcome.
 * @throws {Error} - Throws the error from `resultTuple[1]` if present.
 *                 - Throws a generic `Error` if `resultTuple` is not a valid 2-element array.
 */

const unguard = (result) => {
    if (Array.isArray(result) && result.length === 2) {
        const error = result[1];
        
        if (error === null) {
            return result[0];
        } else {
            throw error instanceof Error
                ? error
                : new TypeError(`[UNGUARD_ERROR_TYPE] Error "${error}"`, {cause: error})
            ;
        }
    }

    throw new SyntaxError('[UNGUARD_ERROR_SYNTAX] Invalid input: not a valid [result, error] tuple.', { cause: result });
}

/**
 * Asynchronously unwraps a result, which can be either a direct tuple `[result, error]`
 * or a Promise resolving to such a tuple (typically from `guardedCall`).
 * If the outcome indicates an error (either directly or after the Promise resolves),
 * this function throws that error. Otherwise, it returns the successful result.
 * 
 * @async
 * @template TResult The type of the result expected if the operation was successful.
 *
 * @param {[TResult, null] | [null, Error] | Promise<([TResult, null] | [null, Error])>} resultOrPromise
 *   The outcome to unwrap. This can be:
 *   1. A direct tuple: `[successfulResult, null]`
 *   2. A direct tuple: `[null, errorInstance]`
 *   3. A Promise that resolves to one of the above tuples.
 *
 * @returns {Promise<TResult>} A Promise that resolves to the unwrapped successful result.
 * @throws {Error} - Throws the error from the tuple if present (either directly or after
 *                   the Promise resolves).
 *                 - Throws a generic `Error` if the resolved value from a Promise is not
 *                   a valid 2-element `[result, error]` tuple.
 */
export const unguardOrThrow = async (resultOrPromise) => {
    const result = await resultOrPromise;
    return unguard(result);
};