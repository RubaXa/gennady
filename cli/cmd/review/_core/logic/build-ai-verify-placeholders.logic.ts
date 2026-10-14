// @file: Re-export proxy — delegates to _shared/prompt/logic/build-ai-verify-placeholders.logic.ts.
// @spec: CLI-REVIEW
// @consumers: review cmd

export type { VerifyCommandPlaceholders } from '../../../_shared/prompt/logic/build-ai-verify-placeholders.logic.ts';
export { buildVerifyCommandPlaceholders } from '../../../_shared/prompt/logic/build-ai-verify-placeholders.logic.ts';
