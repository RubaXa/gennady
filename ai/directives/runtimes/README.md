# Runtime rules

Runtime environment setup and dependency management rules for different runtime platforms.

**Purpose:** Standardize version alignment, package management, module systems, and initialization best practices for each runtime.

## Currently available

- `nodejs-npm-rules.xml` — Node.js runtime with **npm** as package manager: `.nvmrc` alignment, module system consistency (ESM/CommonJS), project structure, reproducible builds via `package-lock.json`.

## Planned (point-in-choice rule files per package manager)

- `nodejs-pnpm-rules.xml` — same Node.js layer, but `pnpm` workspace + `pnpm-lock.yaml`.
- `nodejs-bun-rules.xml` — same Node.js layer, but `bun` runtime + `bun.lockb`.
- `python-uv-rules.xml` — Python with `uv`.
- `docker-rules.xml` — Container runtime: Dockerfile structure, layers, base images.

## Why per-package-manager files

Rule files are **point-in-choice authoritative** — one file = one stack philosophy. The `scope-type=infrastructure` discovery session picks the package manager (npm / pnpm / bun) and activates the matching rule file. This avoids conditional rules ("if npm: do X; if pnpm: do Y") that bloat reading and obscure intent.

## How they differ from coding rules

**Coding rules** (e.g., `typescript-rules.xml`) — how to WRITE code in a language: naming, error handling, comment style.

**Runtime rules** (e.g., `nodejs-npm-rules.xml`) — how to SET UP the runtime environment and manage dependencies: version constraints, package manager discipline, reproducible installs.

Both are necessary in tandem:

- A TypeScript+npm project needs typescript-rules.xml (syntax, patterns) AND nodejs-npm-rules.xml (Node version, npm setup, module system).
