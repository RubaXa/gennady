// @file: Small real-command route smoke for unrelated Grunt tasks and internal documentation aliases.
// @spec: AI-SKILLS
// @consumers: provision; v2-brownfield-routing scenario

/** @purpose Seed ordinary build files, not SDD migration evidence or fake implementation tasks. */
export const BROWNFIELD_ROUTING_FILES: Record<string, string> = {
  'AGENTS.md': '# Fixture instructions\nPreserve existing build and documentation files.\n',
  'docs/usage.md': '# Existing tool\nThe Grunt tasks are ordinary build infrastructure.\n',
  'tasks/README.md': '# Build tasks\nThese are JavaScript build tasks, not SDD tickets.\n',
  'tasks/build.js': 'export function build() { return "build ready"; }\n',
  'inputs/brief.md':
    '# Route smoke\nThis project has ordinary Grunt tasks and documentation, not legacy SDD tickets. Create the internal documentation aliases `CLAUDE.md -> AGENTS.md` and `README.md -> docs` (symbolic links, not copies). Preserve all existing files. Run the installed `npx --no-install gennady sdd-state .`, `npx --no-install gennady sdd-task` and `npx --no-install gennady sync-skills --dry-run`. Report FLOW_VERSION and readiness. Do not migrate, delete the tasks directory, initialize specifications, approve anything, implement product code, or run a non-dry sync. Stop after these read-only inspections.\n',
};
