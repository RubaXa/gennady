# Version control rules

Rules governing the repository itself — not the code inside it.

Distinct from `quality/` — quality rules constrain what gets BUILT (naming, security, accessibility); VCS rules constrain how the REPOSITORY is managed.

## Currently available

- [`git.xml`](git.xml) — git policy: gitignore baseline (incl. `.claude/settings.local.json`), branch strategy, commit conventions (Conventional Commits default), history hygiene, semver tags, hooks integration, LFS/submodules, repo bootstrap, secrets discipline. **Mandatory** — `infra-discovery` halts without it (per `AX_VCS_CATEGORY_MANDATORY`).

## Planned

- `branch-protection.xml` — remote-enforcement rules (required reviews, status checks, force-push prevention) per host (GitHub, GitLab, Bitbucket).
- `release.xml` — release workflow (changelog automation, tag-driven releases, semver-release tooling).
- `jj.xml`, `mercurial.xml`, `fossil.xml` — alternative VCS rule sets if a project chooses one.
