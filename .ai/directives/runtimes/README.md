# Runtime rules

Runtime environment setup and dependency management rules for different runtime platforms.

**Purpose:** Standardize version alignment, package management, module systems, and initialization best practices for each runtime.

## Currently available

- `nodejs-rules.xml` — Node.js runtime: npm package management, `.nvmrc` alignment, module system consistency (ESM/CommonJS), project structure, and reproducible builds.

## Planned

- `python-rules.xml` — Python runtime: venv/poetry, version pinning, dependency management.
- `docker-rules.xml` — Container runtime: Dockerfile structure, layer optimization, base image selection.

## How they differ from coding rules

**Coding rules** (e.g., `typescript-rules.xml`) — how to WRITE code in a language: naming, error handling, comment style, JSDoc structure.

**Runtime rules** (e.g., `nodejs-rules.xml`) — how to SET UP the runtime environment and manage its dependencies: version constraints, package manager discipline, reproducible installs.

Both are necessary:
- A TypeScript project needs typescript-rules.xml (syntax, patterns)
- AND nodejs-rules.xml (Node version, npm setup, module system)
