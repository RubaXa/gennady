// @file: Bounded public tool-result fingerprints and declared purpose; never tool bodies or reasoning.
// @spec: AI-SKILLS
// @consumers: OpenCode evidence capture; per-call authoring audit

import { createHash } from 'node:crypto';
import { safeVerifyText } from '../../shared/verify/reporting/report-safety.ts';

export type ToolObservation = {
  version: 1;
  declaredPurpose?: string;
  requestedReadWindow?: { offset?: number; limit?: number };
  output: {
    available: boolean;
    bytes?: number;
    redactedPrefixBytes?: number;
    redactedPrefixSha256?: string;
    prefixComplete?: boolean;
  };
};

/** @purpose Observe public SDK result identity, not file-access provenance or whether an action was needed. */
export function projectToolObservation(
  tool: string,
  input: Record<string, unknown> | undefined,
  output: unknown,
  root: string
): ToolObservation {
  const result: ToolObservation = { version: 1, output: { available: false } };
  if (typeof input?.description === 'string' && input.description.length <= 2048)
    result.declaredPurpose = safeVerifyText(input.description, root)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .slice(0, 240);
  if (tool === 'read') {
    const window: { offset?: number; limit?: number } = {};
    for (const key of ['offset', 'limit'] as const) {
      const value = input?.[key];
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
        window[key] = value;
    }
    if (Object.keys(window).length) result.requestedReadWindow = window;
  }
  if (typeof output === 'string') {
    const prefix = safeVerifyText(output.slice(0, 65536), root);
    result.output = {
      available: true,
      bytes: Buffer.byteLength(output),
      redactedPrefixBytes: Buffer.byteLength(prefix),
      redactedPrefixSha256: createHash('sha256').update(prefix).digest('hex'),
      prefixComplete: output.length <= 65536,
    };
  }
  return result;
}
