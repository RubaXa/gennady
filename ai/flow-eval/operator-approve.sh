#!/bin/sh
# Simulate a COMPLETE operator approval in an SDD sandbox: flip the portal scope status AND record
# the decision in every spec's Decision Log (Status/Operator decision pending -> approved). The
# portal alone satisfies the mechanical gate, but leaving Decision Log records "pending" makes the
# eval judge (correctly) read the approval boundary as unmet. A real operator records both.
SB="$1"
[ -d "$SB/specs" ] || { echo "usage: operator-approve.sh <sandbox>"; exit 1; }
# 1) portal: 🚧 -> ✅
perl -0pi -e 's/🚧 \(awaiting root sync\)/✅ (awaiting root sync)/g' "$SB/specs/README.md" 2>/dev/null
# 2) Decision Log records across all specs + task indexes
find "$SB/specs" -name '*.md' ! -path '*/node_modules/*' -print0 2>/dev/null | while IFS= read -r -d '' f; do
  perl -0pi -e 's/- \*\*Status:\*\* pending/- **Status:** approved/g; s/- \*\*Operator decision:\*\* pending/- **Operator decision:** approved/g' "$f"
done
echo "operator approval recorded (portal + Decision Log) in $SB"
