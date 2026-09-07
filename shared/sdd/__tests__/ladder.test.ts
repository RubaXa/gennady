// @file: Unit tests for the SDD readiness ladder card render — key states per the operator's format.
// @consumers: ladder
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderLadder, type LadderInput } from '../ladder.ts';

const BASE: LadderInput = {
  version: '1.2.3',
  projectName: null,
  portalPresent: false,
  scopesTotal: 0,
  scopesApproved: 0,
  moduleSpecCount: 0,
  modulesRequired: true,
  authoringReady: false,
  packageJsonPresent: false,
  gates: { typecheck: false, test: false, lint: false },
  tasksTotal: null,
  tasksDone: null,
};

describe('renderLadder', () => {
  it('empty repo: every rung ⬜, next step is /sdd project-setup', () => {
    const text = renderLadder(BASE);
    assert.match(text, /🏗 SDD v1\.2\.3 · «пустой репозиторий»/);
    assert.match(text, /⬜ 1\. Портал\s+specs\/README\.md — отсутствует/);
    assert.match(text, /⬜ 2\. Скоупы\s+нет ни одной/);
    assert.match(text, /⬜ 3\. Модули\s+—/);
    assert.match(text, /⬜ 4\. Инфраструктура\s+не настроена/);
    assert.match(text, /⬜ 5\. Задачи\s+specs\/3-tasks\.md — отсутствует/);
    assert.match(text, /👉 Следующий шаг: создать проект — \/sdd/);
  });

  it('only the portal: rung 1 closed, rest ⬜, next step is a scope spec', () => {
    const text = renderLadder({
      ...BASE,
      projectName: 'Acme',
      portalPresent: true,
      scopesTotal: 0,
    });
    assert.match(text, /🏗 SDD v1\.2\.3 · Acme/);
    assert.match(text, /✅ 1\. Портал\s+specs\/README\.md — скоупов в графе: 0/);
    assert.match(text, /⬜ 2\. Скоупы\s+нет ни одной/);
    assert.match(text, /👉 Следующий шаг: написать и approve скоуп-спеку — \/sdd/);
  });

  it('portal + scopes but none approved: honest 0-approved text, still ⬜, infra does not block it', () => {
    const text = renderLadder({
      ...BASE,
      projectName: 'Acme',
      portalPresent: true,
      scopesTotal: 3,
      scopesApproved: 0,
    });
    assert.match(text, /⬜ 2\. Скоупы\s+approved: 0 из 3/);
    assert.match(text, /👉 Следующий шаг: написать и approve скоуп-спеку — \/sdd/);
  });

  it('scopes approved, modules present, authoring ready: missing runtime gates do not block scaffold', () => {
    const text = renderLadder({
      ...BASE,
      projectName: 'Acme',
      portalPresent: true,
      scopesTotal: 2,
      scopesApproved: 2,
      moduleSpecCount: 4,
      authoringReady: true,
      packageJsonPresent: false,
    });
    assert.match(text, /✅ 2\. Скоупы\s+approved: 2 из 2/);
    assert.match(text, /✅ 3\. Модули\s+модульных спек: 4/);
    assert.match(text, /⬜ 4\. Инфраструктура\s+не настроена/);
    assert.match(text, /👉 Следующий шаг: разбить спеки на задачи — \/sdd-scaffold/);
  });

  it('infra partially wired: per-gate ✅\\⬜, rung stays ⬜ overall', () => {
    const text = renderLadder({
      ...BASE,
      portalPresent: true,
      scopesTotal: 1,
      scopesApproved: 1,
      moduleSpecCount: 1,
      authoringReady: true,
      packageJsonPresent: true,
      gates: { typecheck: true, test: true, lint: false },
    });
    assert.match(text, /⬜ 4\. Инфраструктура\s+гейты: type-check ✅ · test ✅ · lint ⬜/);
    assert.match(text, /👉 Следующий шаг: разбить спеки на задачи — \/sdd-scaffold/);
  });

  it('everything closed: all rungs ✅, next step points at the execute cycle', () => {
    const text = renderLadder({
      projectName: 'Acme',
      portalPresent: true,
      scopesTotal: 2,
      scopesApproved: 2,
      moduleSpecCount: 5,
      modulesRequired: true,
      authoringReady: true,
      packageJsonPresent: true,
      gates: { typecheck: true, test: true, lint: true },
      tasksTotal: 10,
      tasksDone: 10,
    });
    assert.match(text, /✅ 1\. Портал/);
    assert.match(text, /✅ 2\. Скоупы/);
    assert.match(text, /✅ 3\. Модули/);
    assert.match(text, /✅ 4\. Инфраструктура/);
    assert.match(text, /✅ 5\. Задачи\s+тикетов: 10 · done: 10/);
    assert.match(text, /👉 Следующий шаг: всё закрыто — следующий цикл \/sdd-execute/);
  });

  it('tasks scaffolded but not all done: next step is execute, not scaffold', () => {
    const text = renderLadder({
      projectName: 'Acme',
      portalPresent: true,
      scopesTotal: 1,
      scopesApproved: 1,
      moduleSpecCount: 1,
      modulesRequired: true,
      authoringReady: true,
      packageJsonPresent: true,
      gates: { typecheck: true, test: true, lint: true },
      tasksTotal: 6,
      tasksDone: 2,
    });
    assert.match(text, /⬜ 5\. Задачи\s+тикетов: 6 · done: 2/);
    assert.match(text, /👉 Следующий шаг: выполнить следующую задачу — \/sdd-execute/);
  });

  it('everything else closed, no task rollup: next step is scaffold', () => {
    const text = renderLadder({
      projectName: 'Acme',
      portalPresent: true,
      scopesTotal: 1,
      scopesApproved: 1,
      moduleSpecCount: 1,
      modulesRequired: true,
      authoringReady: true,
      packageJsonPresent: true,
      gates: { typecheck: true, test: true, lint: true },
      tasksTotal: null,
      tasksDone: null,
    });
    assert.match(text, /⬜ 5\. Задачи\s+specs\/3-tasks\.md — отсутствует/);
    assert.match(text, /👉 Следующий шаг: разбить спеки на задачи — \/sdd-scaffold/);
  });

  it('uses only the fixed icon set ✅ ⬜ 🏗 👉', () => {
    const text = renderLadder({
      projectName: 'Acme',
      portalPresent: true,
      scopesTotal: 1,
      scopesApproved: 1,
      moduleSpecCount: 1,
      modulesRequired: true,
      authoringReady: true,
      packageJsonPresent: true,
      gates: { typecheck: true, test: true, lint: true },
      tasksTotal: 1,
      tasksDone: 1,
    });
    const emoji = text.match(/[✅⬜🏗👉]/gu) ?? [];
    assert.ok(emoji.length > 0);
    // no other pictographic glyphs sneak in
    const other = text.match(/[←-⇿⌀-➿⬀-⯿\u{1F300}-\u{1FAFF}]/gu) ?? [];
    const allowed = new Set(['✅', '⬜', '🏗', '👉']);
    for (const ch of other) assert.ok(allowed.has(ch), `unexpected icon: ${ch}`);
  });
});
