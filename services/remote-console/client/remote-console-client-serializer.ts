import type { RemoteConsoleSerializedArg } from './remote-console-client.types.ts';

/**
 * @purpose Converts unknown console arguments into deterministic, printable transport-safe descriptors.
 * @param value Single console argument value from browser runtime.
 * @returns Serialized representation that never throws and can always be rendered by stdout writer.
 */
export function serializeRemoteConsoleArg(value: unknown): RemoteConsoleSerializedArg {
  try {
    if (value === null) {
      return { kind: 'primitive', text: 'null' };
    }

    if (value === undefined) {
      return { kind: 'primitive', text: 'undefined' };
    }

    const valueType = typeof value;

    if (
      valueType === 'string' ||
      valueType === 'number' ||
      valueType === 'boolean' ||
      valueType === 'bigint' ||
      valueType === 'symbol'
    ) {
      return { kind: 'primitive', text: String(value) };
    }

    // Functions are tagged instead of stringified as objects to preserve callsite intent without unsafe serialization.
    if (valueType === 'function') {
      const functionValue = value as (...args: unknown[]) => unknown;
      const functionName = functionValue.name || 'anonymous';
      return {
        kind: 'tagged',
        tag: '[object Function]',
        text: `[function ${functionName}]`,
      };
    }

    const tag = Object.prototype.toString.call(value);

    if (value instanceof Error) {
      const message = value.message ? `${value.name}: ${value.message}` : value.name;
      return { kind: 'tagged', tag, text: message };
    }

    const jsonText = safeStringifyForTransport(value);
    if (jsonText) {
      return { kind: 'tagged', tag, text: `${tag} ${jsonText}` };
    }

    // Tag-only fallback keeps payload printable even when value cannot be serialized to JSON safely.
    return { kind: 'tagged', tag, text: tag };
  } catch (cause) {
    return {
      kind: 'tagged',
      tag: '[object Unserializable]',
      text: `[unserializable: ${String(cause)}]`,
    };
  }
}

/**
 * @purpose Converts complex values into JSON text while guarding circular references and unsupported primitives.
 * @param value Candidate object-like argument from console invocation.
 * @returns JSON text when conversion succeeded; otherwise null to trigger tag-only fallback.
 */
function safeStringifyForTransport(value: unknown): string | null {
  const circularGuard = new WeakSet<object>();

  try {
    const json = JSON.stringify(value, (_, nestedValue: unknown) => {
      if (typeof nestedValue === 'bigint') {
        return `${nestedValue.toString()}n`;
      }

      if (typeof nestedValue === 'symbol') {
        return nestedValue.toString();
      }

      if (typeof nestedValue === 'function') {
        return `[function ${(nestedValue as (...args: unknown[]) => unknown).name || 'anonymous'}]`;
      }

      if (nestedValue && typeof nestedValue === 'object') {
        if (circularGuard.has(nestedValue)) {
          return '[circular]';
        }

        circularGuard.add(nestedValue);
      }

      return nestedValue;
    });

    return json ?? null;
  } catch {
    return null;
  }
}
