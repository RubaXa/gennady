# infra-base: Infrastructure Specification

## scope-type

infrastructure

## 1. Vision

Минимальный TS-стек: Node.js 22+, npm, tsc, prettier, node:test, vite. Zero-config formatter, детерминированная установка, быстрая сборка в чанки.

## 2. Tool Stack (minimal bootstrap)

| Category           | Tool      |
| ------------------ | --------- |
| vcs                | git       |
| package-management | npm       |
| type-check         | tsc       |
| formatting         | prettier  |
| test-unit          | node:test |
| bundler            | vite      |

### 2.1 Formatter Fixture Exclusion

`.prettierignore` **обязан** содержать `**/__tests__/fixtures/**` — тестовые фикстуры могут содержать намеренно сломанный синтаксис (parse-failed scenarios), и prettier не должен их обрабатывать. `tsconfig.json` также исключает фикстуры из type-check (`"exclude": ["**/__tests__/fixtures/**"]`).

> Полный Decision Log (Design Variants, rationale, Effective Rules для cascade) — запусти `discovery infra-base`.
