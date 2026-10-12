# infra-base: Infrastructure Specification

## scope-type

infrastructure

## 1. Vision

Минимальный TS-стек: Node.js 22+, npm, tsc, prettier, node:test, vite. Zero-config formatter, детерминированная установка, быстрая сборка в чанки.

## 2. Tool Stack (minimal bootstrap)

| Category           | Tool                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| vcs                | git                                                                        |
| package-management | npm                                                                        |
| type-check         | tsc                                                                        |
| formatting         | prettier                                                                   |
| linting+formatting | prettier + lint:contracts (tsx cli/gennady.ts lint)                        |
| git-hooks          | shell-скрипт `.git/hooks/pre-commit`: format → type-check → lint:contracts |
| test-unit          | node:test                                                                  |
| bundler            | vite                                                                       |

### 2.1 Formatter Fixture Exclusion

`.prettierignore` **обязан** содержать `**/__tests__/fixtures/**` и `**/__tests__/e2e/fixtures/**` (второй паттерн не выводится из первого: `**/__tests__/fixtures/**` не матчит `__tests__/e2e/fixtures/` — проверено) — тестовые фикстуры могут содержать намеренно сломанный синтаксис (parse-failed scenarios), и prettier не должен их обрабатывать. `tsconfig.json` также исключает фикстуры из type-check (`"exclude": ["**/__tests__/fixtures/**", "**/__tests__/e2e/fixtures/**"]`). E2E-фикстуры стековых наборов содержат намеренно невалидные `gennady.yaml`/`package.json` — их переформатирование ломает сами сценарии (см. [`infra-e2e`](../infra-e2e/infra-e2e.spec.md)).

> Полный Decision Log (Design Variants, rationale, Effective Rules для cascade) — запусти `discovery infra-base`.
