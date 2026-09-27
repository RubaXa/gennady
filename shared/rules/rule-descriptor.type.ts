// @file: One deterministic rule-registry descriptor with an opaque prompt body.
// @consumers: RuleRegistry, RuleResolver, rules CLI
// @spec: CLI-RULES

import type { RuleHeader } from './rule-header.type.ts';

/** @purpose Preserve parsed rule metadata, exact prompt body bytes, and source provenance. */
export type RuleDescriptor = RuleHeader & {
  /** @purpose Repository-relative or caller-owned source identity used in diagnostics. */
  readonly source: string;
  /** @purpose Exact bytes between the Meta header and matching final root close. */
  readonly body: string;
  /** @purpose Deterministic SHA-256 identity of the exact opaque body bytes. */
  readonly bodyDigest: string;
};
