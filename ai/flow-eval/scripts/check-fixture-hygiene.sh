#!/usr/bin/env bash
# @file: E-16 — reproducibility + secret-class-file gate for an external eval fixture (a git worktree
#   such as fixture-detmig/rt-regen/fixture-mig-run, which live OUTSIDE this repository under
#   $HOME/.gennady/eval/** by design — see 01-INTERVIEW-DECISIONS.md D-62/L-13 variant (a): the fixture
#   stays out of the repo, but every script that touches it is parameterized and this check is added).
# @usage: check-fixture-hygiene.sh <fixture-dir>
#   Exit 0, silent, when BOTH hold:
#     1. `git -C <dir> status --porcelain` is empty (the tree is reproducible from its recorded SHA —
#        no drift left over from a previous manual/eval session).
#     2. No file under <dir> matches the secret-class name patterns below (.netrc, .npmrc, .env*,
#        credentials*, id_rsa*, *.pem, *.p12, *.keystore, .aws/credentials, gcloud application-default
#        credentials) — case-insensitive, node_modules/.git excluded.
#   Exit 1 with a labelled report of every failing check otherwise.
# @consumers: migration-eval.sh / roundtrip-eval.sh (call before using $FX/$RT for a real run);
#   operators, ad hoc, before pointing any eval task (E-06/E-07/E-08/E-10) at a fixture.
set -uo pipefail

dir="${1:-}"
if [ -z "$dir" ]; then
  echo "usage: check-fixture-hygiene.sh <fixture-dir>" >&2
  exit 2
fi
if [ ! -d "$dir" ]; then
  echo "check-fixture-hygiene: no such directory: $dir" >&2
  exit 2
fi

fail=0

# 1) Reproducible-from-SHA: the worktree must have zero drift from what a fresh `git worktree add`
#    at its recorded base commit would produce.
if ! git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "FAIL: $dir is not a git working tree" >&2
  fail=1
else
  dirty="$(git -C "$dir" status --porcelain 2>&1)"
  if [ -n "$dirty" ]; then
    echo "FAIL: $dir has uncommitted drift (not reproducible from its base SHA):" >&2
    echo "$dirty" | sed 's/^/    /' >&2
    fail=1
  fi
fi

# 2) Secret-class files: name-pattern scan, case-insensitive, skipping .git/node_modules.
secret_patterns=(
  '.netrc' '.npmrc' '.env' '.env.*' 'credentials' 'credentials.*' 'id_rsa' 'id_rsa.*'
  'id_ed25519' 'id_ed25519.*' '*.pem' '*.p12' '*.keystore' '*.jks'
  'application_default_credentials.json'
)
find_args=()
for pattern in "${secret_patterns[@]}"; do
  if [ ${#find_args[@]} -gt 0 ]; then find_args+=(-o); fi
  find_args+=(-iname "$pattern")
done
hits="$(find "$dir" \( -path '*/.git' -o -path '*/.git/*' -o -path '*/node_modules' -o -path '*/node_modules/*' \) -prune -o -type f \( "${find_args[@]}" \) -print 2>/dev/null)"
if [ -n "$hits" ]; then
  echo "FAIL: $dir contains file(s) of the secret class:" >&2
  echo "$hits" | sed 's/^/    /' >&2
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  exit 0
fi
exit 1
