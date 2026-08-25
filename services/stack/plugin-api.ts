// @file: The host API a stack plugin may use — the whole surface, re-exported in one place.
// @consumers: plugins/**, package.json#exports["./stack"]
// @tasks: TSK-96

export type {
  Cmd,
  EnvFailPredicate,
  Gate,
  GateOutcome,
  GatePlanOptions,
  GateSpec,
  ScopeRequest,
  StackDetection,
  StackDiagnostic,
  StackPlugin,
  StackScope,
  StackVerifyCapability,
} from './stack.types.ts';

export { allOf, exitCodeMatches, outputMatches, streamMatches } from './env-fail.ts';
export { parseDuration } from '../config/config-loader.ts';
export { execFileTrimSafe } from '../../shared/common/exec.ts';
