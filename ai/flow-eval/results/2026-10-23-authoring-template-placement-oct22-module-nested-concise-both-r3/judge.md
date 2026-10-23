# authoring-template-placement-oct22-module-nested-concise-both-r3 — inconclusive (completed)

<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="bash">
<｜｜DSML｜｜ parameter name="command" string="true">pwd && find . -maxdepth 4 -type f | sort | sed -n '1,200p'</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
<｜｜DSML｜｜ invoke name="bash">
<｜｜DSML｜｜ parameter name="command" string="true">cat inputs/brief.md 2>/dev/null; printf '\n--- token spec ---\n'; cat specs/token/token.spec.md 2>/dev/null; printf '\n--- docs ---\n'; cat docs/token-contract.md 2>/dev/null</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>
