# Task: TSK-48 — Установка ink + react + @types/react

## 1. Meta

- **Task-ID:** TSK-48
- **Status:** [ ] TODO
- **Purpose:** Установить зависимости для TUI: ink@^7, react@^19, @types/react
- **Scope:** agent-mon-cli
- **Module:** N/A (bootstrap)
- **Dependencies:** None
- **Reopens:** 0
- **Spec References:**
  - Scope: [`agent-mon-cli` §8 Bootstrap](../../../specs/agent-mon-cli/agent-mon-cli.spec.md#8-bootstrap-requirements)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind      | Deps | Status |
| --- | --------- | ---- | ------ |
| P1  | bootstrap | —    | [x]    |

## 3. Phases

### P1 — bootstrap

- **Objective:** `npm install ink react` + `npm install -D @types/react`
- **Rules:**
  - [nodejs-npm-setup](../../../ai/directives/infra/nodejs-npm-setup.xml)
- **Target Files:**
  - `package.json`
  - `package-lock.json`
- **Inputs:** none
- **Exit:** `npm ls ink react` → оба пакета присутствуют; `npx tsc --noEmit` проходит

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Установка TUI-зависимостей

**Scenario:** ink и react установлены [`contract`]

- **Given** package.json без ink/react
- **When** `npm install ink react`
- **Then** `npm ls ink` → ok, `npm ls react` → ok
- **And** `npx tsc --noEmit` → exit 0

**Scenario:** @types/react установлен [`contract`]

- **Given** package.json без @types/react
- **When** `npm install -D @types/react`
- **Then** `npm ls @types/react` → ok

## 5. Verification

| Command          | Required by |
| ---------------- | ----------- |
| npm ls ink react | bootstrap   |

## 6. Test Scenario Coverage

- Scenario "ink и react установлены" → contract-level (npm ls)
- Scenario "@types/react установлен" → contract-level (npm ls)

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] 2026-05-22T09:30:01Z ver npm ls ink react → pass exit=0
- [x] 2026-05-22T09:30:01Z DONE
      **Handoff →** artifacts: [package.json, package-lock.json]; decisions: [ink=^7, react=^19, @types/react=^19 (dev)]; open: []

#### Round close

- [ ] `<ts>` DONE

#### Round close

- [x] `2026-05-22T10:45:57Z` DONE
