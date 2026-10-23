# authoring-template-placement-oct22-module-nested-template-rich-r2 — inconclusive (completed)

<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="bash">
<｜｜DSML｜｜ parameter name="command" string="true">ls -la && printf '\n--- brief ---\n' && sed -n '1,240p' inputs/brief.md 2>/dev/null && printf '\n--- token spec ---\n' && sed -n '1,260p' specs/token/token.spec.md 2>/dev/null</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
<｜｜DSML｜｜ invoke name="bash">
<｜｜DSML｜｜ parameter name="command" string="true">printf '%s\n' '--- target ---' && sed -n '1,320p' specs/token/pipeline/normalize/normalize.spec.md 2>/dev/null && printf '%s\n' '--- skill/module template refs ---' && find .claude/skills/sdd -maxdepth 4 -type f | sort | sed -n '1,160p'</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>
