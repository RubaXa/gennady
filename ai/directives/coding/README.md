# Coding rules

Language-specific rules for HOW to write code: syntax preferences, naming, error handling, comment style, language idioms.

Distinct from:

- `runtimes/` — runtime SETUP (Node version, package manager).
- `quality/` — cross-language quality (binary lint severity, formatting delegation).
- `architecture/` — composition patterns.

## Currently available

- [`typescript-rules.xml`](typescript-rules.xml) — TypeScript writing conventions.
- [`svelte5-runes.xml`](svelte5-runes.xml) — Svelte 5 runes: $state, $derived, $effect, $props, template syntax. **Inherits typescript-rules.**
- [`sveltekit-rules.xml`](sveltekit-rules.xml) — SvelteKit fullstack: routing, load, form actions, hooks, $app modules. **Inherits svelte5-runes + typescript-rules.**

## Planned

- `react-rules.xml` — React component patterns, hooks discipline, JSX conventions.
- `go-rules.xml` — Go idioms, error handling, package layout.
- `python-rules.xml` — Python style (PEP 8 + project-specific tightening), type hints, dataclasses vs Pydantic.
- `rust-rules.xml` — Rust idioms, error handling (`Result`, `?` operator), lifetimes & borrowing patterns.
- `css-rules.xml` — CSS naming (BEM / utility-first), specificity discipline.
