# Frozen MAIN disposition — R4

This is inert reconciliation evidence, never an active spec/ticket/runtime or package asset.
The manifest freezes MAIN `9663c65b6376c65f4b1df0daf27a06df5b25f7a3`, audit release
`df39f8eff9d08caca5e3d90d313479cc50ed4fc0`, merge-base
`46c6d616700ee4cc61dbfe077d5b0052ce661dcd` and reviewed release base
`73bea8eb82897690e8d584982189d59e6edc3f50`.

There are 117 MAIN-only commit refs and 520 rename-aware delta rows, covering 521 raw path
identities. The single relocation preserves both names. Every original postimage and preimage is
an exact Git blob under `objects/<oid>.blob`; deletion remains deletion, not an invented source file.
Original status/links/errors/PASS records are preserved without rewriting history or manufacturing
current execution state. Archived markup is opaque raw bytes, not XML-parser input.

`dispositions.json` is the explicit reviewed per-path decision input. `manifest.json` records its
digest, Git object/mode and SHA-256/size identities, all rows/commits and actual current owner/target/
proof bytes. `retain` only asserts exact bytes at the current path; it does not activate historical
fixture data or assert dependency/API/runtime parity. `adapt` names current owners and bounded
causal proof; `archive` preserves historical narrative/user/spec/journal data; `exclude` intentionally
replaces old execution/control-plane code while preserving its raw source for review.

Current proof binds final files, not a self-referential eventual commit SHA. Permanent integrity
reconstructs frozen source refs even after legitimate main history advances. The strict
pre-reconciliation/candidate check additionally requires HEAD and current origin/release to descend
from the reviewed release base, origin/release to be an ancestor of HEAD, and current origin/main
to equal frozen MAIN; changed live refs require a new delta audit before reconciliation. Any
current mapped target/owner/checker byte drift rejects after R4 commit or during R5. Regeneration
is an explicit reviewed authoring operation, never automatic error recovery:

```sh
node --import tsx scripts/freeze-main-disposition.ts --write
npm run audit:main-carry
npm run audit:main-carry -- --pre-reconciliation
```

The integrity checker is a mandatory normal pre-commit gate. Before R5 reconciliation, strict
pre-reconciliation audit must pass; the existing release-boundary candidate/ACK SSOT unconditionally
runs that strict check and binds the manifest digest. No policy/env switch disables that production
boundary. Post-main integrity does not automatically approve new main changes. Raw `.blob` suffix and an anchor-free README
keep historical records outside active Markdown ticket discovery; the package `files` allowlist
excludes this entire root. Tests exercise actual discovery and local npm pack exclusion.

R5 reconciliation, final UV25 refresh, compatible-host exact E18, independent exact-candidate review
and operator ACK remain separate OPEN boundaries. This archive authorizes no merge or publication.
