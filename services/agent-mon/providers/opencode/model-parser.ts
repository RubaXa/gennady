// @file: OpenCode model JSON parser — extracts model id
// @consumers: OpenCodeProvider
// @tasks: TSK-40

/**
 * @purpose Extract the model id from a raw OpenCode model JSON string.
 * @param raw The model JSON string or null.
 * @returns The extracted model id, 'unknown' on parse failure, undefined for null input.
 */
export function parseModelJson(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const obj = JSON.parse(raw);
    return obj.id ?? raw;
  } catch {
    return 'unknown';
  }
}
