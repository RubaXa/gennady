# Testing rules

Test framework usage policy: structure, fixtures, isolation, naming.

## Currently available

- [`node-test.xml`](node-test.xml) — Node.js built-in `node:test` runner usage policy.
- [`vitest-rules.xml`](vitest-rules.xml) — Vitest usage policy: structure, mocking, snapshot discipline, file organization.
- [`playwright-cli.xml`](playwright-cli.xml) — Playwright CLI exploration & debugging: AX Tree vision, aria snapshots, trace viewer, codegen, headless self-verification. **Prerequisite for playwright-e2e.**
- [`playwright-e2e.xml`](playwright-e2e.xml) — Playwright e2e test authoring: aria-snapshot-first contracts, role-based locators, fixture-based POM, auth via storageState, network mocking. **Activated after CLI exploration.**
- [`storybook-usage.xml`](storybook-usage.xml) — Storybook MCP tools for component development: reading manifests (component docs, props, stories), writing stories, running tests, self-verifying component rendering. **Activated when MCP server is running.**
- [`svelte-testing.xml`](svelte-testing.xml) — Testing Svelte 5 components: `.svelte.test.ts` extension, `$effect.root`, `flushSync`, `mount`/`unmount`, `@testing-library/svelte`. **Inherits node-test + vitest-rules.**

## Planned

- `jest.xml` — Jest usage (legacy projects).
- `cypress.xml` — alternative E2E runner.
- `storybook.xml` — UI component testing in isolation.
- `pytest.xml` — Python testing: fixtures, parametrization, conftest patterns.
- `go-test.xml` — Go testing: table-driven tests, subtests, golden files.

## Activation default

Testing rules activate `later` by default per `AX_RULE_ACTIVATION_DEFAULTS` — they're consumed by execution agents when test files are written, not walked through with the operator at selection time. Override to `now` if a test rule has strong opinions worth surfacing (e.g., snapshot-discipline policy for a UI library).
