# Quality rules

Cross-cutting quality rules constraining the **code being built** (not the repository — that's `vcs/`).

Apply universally regardless of language, framework, or architecture.

## Currently available

- [`eslint-rules.xml`](eslint-rules.xml) — ESLint usage policy: binary severity (`'error'` or `'off'`, no `'warn'`), autofix-preferred rule selection, formatter delegation (Prettier owns formatting), type-check delegation (tsc owns type errors), agent-disable-comments forbidden, flat config shape. ~600 lines of opinionated meta-policy.

## Planned

- `biome-rules.xml` — Biome usage policy (alternative to eslint+prettier — single tool covers both).
- `naming.xml` — cross-language naming conventions for files, exports, variables.
- `security.xml` — secret handling, dependency scanning, common vulnerability patterns.
- `accessibility.xml` — WCAG-derived rules for UI projects (a11y attributes, keyboard navigation, color contrast).
- `i18n.xml` — localization patterns (string extraction, plural rules, RTL support).

## Distinction from neighbouring categories

| Category | Constrains |
|---|---|
| `coding/` | how to WRITE code in a specific language (`typescript-rules.xml` etc.) |
| `quality/` | cross-language quality concerns (this directory) |
| `architecture/` | how components COMPOSE (`ports-adapters.xml` etc.) |
| `vcs/` | the REPOSITORY itself (`git.xml`) |
| `runtimes/` | runtime SETUP (`nodejs-npm-rules.xml` etc.) |
| `testing/` | TEST framework rules (`vitest-rules.xml` etc.) |
