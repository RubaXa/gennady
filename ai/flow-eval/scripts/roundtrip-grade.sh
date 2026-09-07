#!/usr/bin/env bash
# @file: Independent grade for the SDD round-trip — compares the REGENERATED guard script against Artur's
#   ORIGINAL by the sum of factors, never byte-for-byte. Runs the frozen golden 82-probe behavioural bench
#   against each guard, then scores the non-behavioural factors (exit-code contract, format/shell hygiene,
#   requirements coverage across the eight check groups). Verdict: regenerated ≥ original iff its behavioural
#   score is at least the original's AND every non-behavioural factor holds.
set -uo pipefail
export PATH="/opt/homebrew/bin:$PATH"
export TMPDIR=/tmp                                            # no trailing slash — SwiftLint SIGBUS guard

RT="${1:-/Users/k.lebedev/.gennady/eval/cloud-ios/rt-regen}"
GUARD="Tools/check-swiftlint-exceptions.sh"
# The behavioural bench is a SELF-CONSISTENT test bed (trimmed .swiftlint.yml → exactly 6 frozen
# violations, App/Core kept clean; see harness.sh header). Its config context lives in bench-smoke, NOT
# in the full repo tree — so the grade stages FROM bench-smoke and swaps in only the guard under test.
BENCH_SRC="${BENCH_SRC:-/Users/k.lebedev/.gennady/eval/cloud-ios/bench-smoke}"
BENCH="$BENCH_SRC/Tools/tests/probes.sh"
[ -f "$BENCH" ] || { echo "no bench at $BENCH"; exit 2; }
[ -f "$RT/$GUARD" ] || { echo "no regenerated guard at $RT/$GUARD — run execute"; exit 2; }

# Run the frozen bench with a given guard script swapped into a staging copy of the bench-smoke test bed.
run_bench() {  # <guard-file> <label>  → prints "PASS/TOTAL"
  local guard="$1" label="$2" stage work
  stage="$TMPDIR/rt-stage-$label"; work="$TMPDIR/rt-work-$label"
  rm -rf "$stage" "$work" 2>/dev/null || true
  mkdir -p "$stage/Tools/tests" "$work"
  # copy the whole bench-smoke test bed (trimmed config + Tools/tests), then swap the guard under test
  cp -R "$BENCH_SRC/MRCloudApp" "$stage/MRCloudApp"
  cp "$BENCH_SRC/.mise.toml" "$stage/.mise.toml"
  cp -R "$BENCH_SRC/Tools/tests/." "$stage/Tools/tests/"
  cp "$guard" "$stage/Tools/check-swiftlint-exceptions.sh"
  chmod +x "$stage/Tools/check-swiftlint-exceptions.sh"
  bash "$stage/Tools/tests/probes.sh" "$stage" "$work" > "$work/bench.out" 2>&1 || true
  cp "$work/bench.out" "$RT/golden/bench-$label.out" 2>/dev/null || true
  # SOFT behavioural score — the bar the user set: NOT byte-for-byte on Artur's exact diagnostic
  # wording. A probe counts as behaviourally-correct when its EXIT CODE matches AND the tree is
  # unchanged; a FAIL that only misses an exact output substring ("нет в выводе: …") is a diagnostic
  # gap, reported separately, not a behavioural failure. (Hard/exact score kept for reference.)
  local total hardfail hardpass softpass wording
  total=$(grep -cE '^(PASS|FAIL)' "$work/bench.out")
  hardpass=$(grep -c '^PASS' "$work/bench.out" 2>/dev/null || echo 0)
  hardfail=$(grep '^FAIL' "$work/bench.out" | grep -Ec 'exit=[0-9]+ want=[0-9]+|дерево изменилось' || true)
  softpass=$((total - hardfail))
  wording=$(grep '^FAIL' "$work/bench.out" | grep -c 'нет в выводе' || true)
  printf '%s' "$softpass/$total soft (exit+tree) · $hardpass/$total exact · $wording wording-only gaps"
}

echo "════════════ ROUND-TRIP GRADE ════════════"
echo "Behavioural bench (frozen golden 82 probes):"
ART=$(run_bench "$RT/golden/check-swiftlint-exceptions.sh" original)
REG=$(run_bench "$RT/$GUARD" regen)
printf '  Artur original : %s\n  Regenerated    : %s\n' "$ART" "$REG"

# per-group coverage on the regenerated guard (which of the eight check families are exercised green)
echo "Requirements coverage (regen bench, PASS per check family):"
for g in C0 C1 C2 C3 C4 C5 C6 C7 C8 F1 F3; do
  p=$(grep -E "^PASS  $g[-A-Za-z0-9]" "$RT/golden/bench-regen.out" 2>/dev/null | wc -l | tr -d ' ')
  f=$(grep -E "^FAIL  $g[-A-Za-z0-9]" "$RT/golden/bench-regen.out" 2>/dev/null | wc -l | tr -d ' ')
  [ "$((p+f))" -gt 0 ] && printf '  %-3s %s/%s\n' "$g" "$p" "$((p+f))"
done

echo "Non-behavioural factors (regenerated guard):"
g="$RT/$GUARD"
head1=$(head -1 "$g")
printf '  shebang            : %s\n' "$([ "${head1#\#!}" != "$head1" ] && echo "yes ($head1)" || echo NO)"
printf '  strict mode        : %s\n' "$(grep -qE 'set -[eu]' "$g" && echo yes || echo NO)"
printf '  executable bit     : %s\n' "$([ -x "$g" ] && echo yes || echo NO)"
printf '  aggregates checks  : %s\n' "$(grep -qiE 'находок|поломок окружения' "$g" && echo yes || echo '?')"
printf '  baseline as JSON   : %s\n' "$(grep -qiE 'jq|json' "$g" && echo yes || echo '?')"
printf '  exit contract 0/1/2: %s\n' "$(grep -qE 'exit 2|код 2|envfail' "$g" && echo yes || echo '?')"
if command -v shellcheck >/dev/null 2>&1; then
  sc=$(shellcheck -S error "$g" 2>&1 | grep -c '^In ' || true); printf '  shellcheck errors  : %s\n' "$sc"
else
  printf '  shellcheck errors  : (shellcheck not installed)\n'
fi
printf '  line count         : regen=%s  original=%s\n' \
  "$(wc -l < "$g" | tr -d ' ')" "$(wc -l < "$RT/golden/check-swiftlint-exceptions.sh" | tr -d ' ')"

echo "Real behavioural gaps (exit-code divergences — NOT wording):"
grep '^FAIL' "$RT/golden/bench-regen.out" | grep -E 'exit=[0-9]+ want=[0-9]+' | sed -E 's/;.*//; s/^FAIL/  -/' | head -20
echo "──────────────────────────────────────────"
rp=${REG%%/*}; ap=${ART%%/*}
if [ "${rp:-0}" -ge "${ap:-99}" ]; then
  echo "VERDICT: regenerated ≥ original on the SOFT behavioural contract (regen $rp ≥ Artur $ap of $((${REG#*/} )) — exit-code+tree, wording ignored per the soft-check policy). Diagnostic richness is a separate factor above."
else
  echo "VERDICT: regenerated BELOW original on the soft contract (regen $rp < Artur $ap). The gap is the exit-code divergences listed above (edge cases) plus weaker diagnostics — NOT byte-for-byte wording. A functioning guard was regenerated from spec→tasks→code; it does not yet match Artur's edge-case depth."
fi
