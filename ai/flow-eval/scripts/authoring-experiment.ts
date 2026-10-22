// @file: Reproducible case/repetition matrix and strict comparison of durable authoring records.
// @spec: AI-SKILLS
// @consumers: operator eval workflow; authoring experiment tests

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AUTHORING_CASE_IDS,
  getAuthoringCase,
  type AuthoringCaseId,
} from '../authoring-benchmark.ts';
import { compareAuthoringExperiments, type AuthoringObservation } from '../authoring-metrics.ts';
import type { SddEvalScenario } from '../types.ts';

/** @purpose Expand a frozen task matrix; variant/repetition labels do not modify the worker's task. */
export function createAuthoringMatrix(
  campaign: string,
  variant: string,
  repetitions = 3,
  cases: readonly AuthoringCaseId[] = AUTHORING_CASE_IDS
): SddEvalScenario[] {
  if (![campaign, variant].every((value) => /^[a-z][a-z0-9-]{0,47}$/.test(value)))
    throw new Error('invalid campaign/variant label');
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 100)
    throw new Error('invalid repetitions');
  if (
    !cases.length ||
    new Set(cases).size !== cases.length ||
    cases.some((id) => !AUTHORING_CASE_IDS.includes(id))
  )
    throw new Error('invalid case matrix');
  return Array.from({ length: repetitions }, (_, index) =>
    cases.map((caseId): SddEvalScenario => {
      const definition = getAuthoringCase(caseId);
      return {
        id: `authoring-${campaign}-${caseId}-${variant}-r${index + 1}`,
        fixture: 'authoring-benchmark',
        phase: 'artifact-authoring',
        mode: 'template-to-artifact',
        authoringBenchmark: { campaign, caseId, variant, repetition: index + 1 },
        intent: `Author only ${definition.target} from inputs/brief.md using the actual installed template and owner instructions. No product implementation, extra artifact creation, or operator approval.`,
        acceptance:
          definition.brief +
          '\nThe source-owned artifact oracle and observed create/read/whole-write path must pass; preserve all existing seed bytes. Independent semantic review and full SDD routing are not claimed.',
        budgetMs: 180000,
        trajectoryRules: {
          requiredCommands: ['sdd-new'],
          forbiddenCommands: ['--no-verify', 'sdd-migrate'],
          maxTools: 40,
        },
      };
    })
  ).flat();
}

/** @purpose Read every selected record, refusing malformed/incomplete records instead of dropping bad runs. */
export async function readAuthoringObservations(
  root: string,
  campaign: string,
  variants: readonly string[]
): Promise<AuthoringObservation[]> {
  const output: AuthoringObservation[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const selected =
      entry.name.includes(`-authoring-${campaign}-`) &&
      variants.some((variant) => entry.name.includes(`-${variant}-r`));
    if (!selected) continue;
    const summary = JSON.parse(await readFile(join(root, entry.name, 'summary.json'), 'utf8')) as {
      authoringBenchmark?: AuthoringObservation;
    };
    if (
      !summary.authoringBenchmark ||
      summary.authoringBenchmark.campaign !== campaign ||
      !variants.includes(summary.authoringBenchmark.variant)
    )
      throw new Error(`incomplete/misbound authoring record: ${entry.name}`);
    output.push(summary.authoringBenchmark);
  }
  return output;
}

async function main(args: string[]) {
  const command = args.shift();
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || !value || options.has(key))
      throw new Error('expected distinct --key value pairs');
    options.set(key, value);
  }
  const allowed = new Set([
    '--campaign',
    '--variant',
    '--repetitions',
    '--cases',
    '--out',
    '--baseline',
    '--candidate',
    '--results-dir',
  ]);
  if ([...options.keys()].some((key) => !allowed.has(key))) throw new Error('unknown option');
  const required = (name: string) => {
    const value = options.get(name);
    if (!value) throw new Error(`missing ${name}`);
    return value;
  };
  const campaign = required('--campaign');
  const cases = options.has('--cases')
    ? (required('--cases').split(',') as AuthoringCaseId[])
    : [...AUTHORING_CASE_IDS];
  const repetitions = Number(options.get('--repetitions') ?? 3);
  let result: unknown;
  if (command === 'plan')
    result = createAuthoringMatrix(campaign, required('--variant'), repetitions, cases);
  else if (command === 'compare') {
    const baseline = required('--baseline');
    const candidate = required('--candidate');
    result = compareAuthoringExperiments(
      await readAuthoringObservations(required('--results-dir'), campaign, [baseline, candidate]),
      baseline,
      candidate,
      cases,
      repetitions
    );
    if (!(result as { comparable: boolean }).comparable) process.exitCode = 2;
  } else
    throw new Error(
      'usage: authoring-experiment.ts plan|compare --campaign NAME [--variant NAME|--baseline NAME --candidate NAME] [--cases CSV] [--repetitions N] [--results-dir DIR] [--out FILE]'
    );
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (options.has('--out')) await writeFile(required('--out'), output, { flag: 'wx' });
  else console.log(output.trimEnd());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
