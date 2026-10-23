# authoring-template-placement-oct22-module-nested-concise-both-r1 — inconclusive (completed)

<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="bash">
<｜｜DSML｜｜ parameter name="command" string="true">pwd && git status --short && ls -la && find specs -maxdepth 4 -type f 2>/dev/null | sort | sed -n '1,120p'</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
<｜｜DSML｜｜ invoke name="bash">
<｜｜DSML｜｜ parameter name="command" string="true">sed -n '1,240p' ai/directives/sdd-v2/module.directive.xml 2>/dev/null; printf '\n---BRIEF---\n'; sed -n '1,240p' inputs/brief.md 2>/dev/null</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>
