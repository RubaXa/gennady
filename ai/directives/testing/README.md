# Testing rules

Test framework usage policy: structure, fixtures, isolation, naming.

## Currently available

- [`node-test.xml`](node-test.xml) — Node.js built-in `node:test` runner usage policy.
- [`vitest-rules.xml`](vitest-rules.xml) — Vitest usage policy: structure, mocking, snapshot discipline, file organization.

## Planned

- `playwright.xml` — E2E testing with Playwright: page object model, fixtures, parallelization.
- `jest.xml` — Jest usage (legacy projects).
- `cypress.xml` — alternative E2E runner.
- `storybook.xml` — UI component testing in isolation.
- `pytest.xml` — Python testing: fixtures, parametrization, conftest patterns.
- `go-test.xml` — Go testing: table-driven tests, subtests, golden files.

## Activation default

Testing rules activate `later` by default per `AX_RULE_ACTIVATION_DEFAULTS` — they're consumed by `task-execution` when test files are written, not walked through with the operator at selection time. Override to `now` if a test rule has strong opinions worth surfacing (e.g., snapshot-discipline policy for a UI library).
