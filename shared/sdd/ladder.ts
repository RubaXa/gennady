// @file: Render the SDD readiness ladder card — the five-rung project-state summary sdd-state shows verbatim.
// @consumers: sdd-state.cmd
// @tasks: N/A

/** @purpose Exact-name presence of the three gate scripts checked at the Infrastructure rung. */
export type LadderGates = {
  /** @purpose `typecheck` npm script declared. */
  typecheck: boolean;
  /** @purpose `test` npm script declared. */
  test: boolean;
  /** @purpose `lint` npm script declared. */
  lint: boolean;
};

/**
 * @purpose Deterministic inputs for the readiness ladder — a reduction of what sdd-state already gathers.
 * @invariant `scopesApproved` <= `scopesTotal`; `tasksDone` <= `tasksTotal` whenever both are non-null.
 */
export type LadderInput = {
  /** @purpose Running gennady package version, stamped into the card header so stale deploys are visible at a glance. */
  version: string;
  /** @purpose Project name parsed from the portal's `# ` heading, or null when absent/untitled. */
  projectName: string | null;
  /** @purpose Whether specs/README.md (the portal) exists. */
  portalPresent: boolean;
  /** @purpose Scope count from the portal Scopes table. */
  scopesTotal: number;
  /** @purpose Scopes whose status is `done` (approved). */
  scopesApproved: number;
  /** @purpose Count of module-classified spec files (MODULE_VISION marker) anywhere under specs/. */
  moduleSpecCount: number;
  /** @purpose Whether at least one approved product/library scope requires module decomposition. */
  modulesRequired: boolean;
  /** @purpose Whether the approved spec graph may be scaffolded even when runtime gates are absent. */
  authoringReady: boolean;
  /** @purpose Whether a parseable package.json exists — the rung reads not-configured when false. */
  packageJsonPresent: boolean;
  /** @purpose Exact-name presence of the three gate scripts. */
  gates: LadderGates;
  /** @purpose Total tickets across the project task rollup (specs/3-tasks.md), or null when absent/unparseable. */
  tasksTotal: number | null;
  /** @purpose Done tickets across the rollup; meaningful only when tasksTotal is non-null. */
  tasksDone: number | null;
  /** @purpose Active owner route that suppresses the generic first-unclosed-rung suggestion. */
  nextOverride?: string;
};

/** @purpose Column width the rung label is padded to, so every description lines up. */
const LABEL_WIDTH = 17;

/** @purpose Render one ✅/⬜ icon from a boolean. */
function mark(done: boolean): string {
  return done ? '✅' : '⬜';
}

/**
 * @purpose Render the five-rung SDD readiness ladder card, verbatim text the router shows the operator.
 * @invariant Rung order is fixed: Portal, Scopes, Modules, Infrastructure, Tasks — product rungs before infra.
 * @invariant Infrastructure never blocks Scopes/Modules; the scan reaches it only once both are closed, gating only the path to Tasks.
 * @invariant Icons are restricted to the fixed set ✅ ⬜ 🏗 👉.
 * @param s Deterministic ladder inputs gathered by sdd-state.
 * @returns The card as one multi-line string, ready to print verbatim.
 */
export function renderLadder(s: LadderInput): string {
  const portalDone = s.portalPresent;
  const scopesDone = s.scopesTotal > 0 && s.scopesApproved === s.scopesTotal;
  const modulesDone = s.scopesTotal > 0 && (!s.modulesRequired || s.moduleSpecCount > 0);
  const infraDone = s.packageJsonPresent && s.gates.typecheck && s.gates.test && s.gates.lint;
  const tasksDone =
    s.tasksTotal !== null &&
    s.tasksTotal > 0 &&
    s.tasksDone !== null &&
    s.tasksDone === s.tasksTotal;

  const step1 = portalDone
    ? `specs/README.md — скоупов в графе: ${s.scopesTotal}`
    : 'specs/README.md — отсутствует';

  const step2 =
    s.scopesTotal === 0 ? 'нет ни одной' : `approved: ${s.scopesApproved} из ${s.scopesTotal}`;

  const step3 =
    s.scopesTotal > 0 && !s.modulesRequired
      ? 'не требуются (infra-only)'
      : s.moduleSpecCount > 0
        ? `модульных спек: ${s.moduleSpecCount}`
        : '—';

  const step4 = !s.packageJsonPresent
    ? 'не настроена'
    : `гейты: type-check ${mark(s.gates.typecheck)} · test ${mark(s.gates.test)} · lint ${mark(s.gates.lint)}`;

  const step5 =
    s.tasksTotal === null
      ? 'specs/3-tasks.md — отсутствует'
      : `тикетов: ${s.tasksTotal} · done: ${s.tasksDone ?? 0}`;

  const name = s.portalPresent && s.projectName ? s.projectName : '«пустой репозиторий»';

  // #region START_NEXT_STEP — first unclosed rung; Infra is reachable only once Scopes+Modules are closed
  let next: string;
  if (s.nextOverride) next = s.nextOverride;
  else if (!portalDone) next = 'создать проект — /sdd';
  else if (!scopesDone) next = 'написать и approve скоуп-спеку — /sdd';
  else if (!modulesDone) next = 'разбить скоуп на модули — /sdd';
  else if (s.tasksTotal === null || s.tasksTotal === 0)
    next = s.authoringReady
      ? 'разбить спеки на задачи — /sdd-scaffold'
      : 'исправить готовность спецификаций к scaffold — /sdd';
  else if (!tasksDone) next = 'выполнить следующую задачу — /sdd-execute';
  else if (!infraDone) next = 'завершить инфраструктурную задачу — /sdd-execute';
  else next = 'всё закрыто — следующий цикл /sdd-execute';
  // #endregion END_NEXT_STEP

  const pad = (label: string): string => label.padEnd(LABEL_WIDTH);

  return [
    `🏗 SDD v${s.version} · ${name}`,
    '',
    `  ${mark(portalDone)} 1. ${pad('Портал')}${step1}`,
    `  ${mark(scopesDone)} 2. ${pad('Скоупы')}${step2}`,
    `  ${mark(modulesDone)} 3. ${pad('Модули')}${step3}`,
    `  ${mark(infraDone)} 4. ${pad('Инфраструктура')}${step4}`,
    `  ${mark(tasksDone)} 5. ${pad('Задачи')}${step5}`,
    '',
    `  👉 Следующий шаг: ${next}`,
  ].join('\n');
}
