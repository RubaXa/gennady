// @file: sdd-new command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-new command.
 */
export function printHelp(): void {
  console.info('gennady sdd-new — Scaffold one SDD v2 artifact from the shared template registry');
  console.info('');
  console.info('Usage:');
  console.info(
    '  npx gennady sdd-new <kind> --scope <s> [--module <m>] [--id <ACR-slug>] [--slug <slug>] [--out <path>]'
  );
  console.info('  npx gennady sdd-new --list');
  console.info('  npx gennady sdd-new <kind> --manifest');
  console.info('');
  console.info('Arguments:');
  console.info(
    '  <kind>   product | library | infrastructure | interface | module | task | portal | research | module-index | scope-index | project-index'
  );
  console.info('');
  console.info('Options:');
  console.info(
    '  --scope <s>       One kebab-case scope name (never a path). Required for conventional'
  );
  console.info(
    '                    scope-aware paths. A task may instead infer it from one canonical'
  );
  console.info('                    --out owner; other kinds may omit it with explicit --out.');
  console.info(
    '  --module <m>      Module name. Required for module. Optional for task/module-index — omit'
  );
  console.info('                    it for a flat scope (no module subdivision): the path stays');
  console.info(
    '                    specs/<scope>/<scope>.task.<id>.md / specs/<scope>/<scope>.3-tasks.md.'
  );
  console.info('  --id <ACR-slug>   Task-ID slug. Always required for task, including with --out.');
  console.info(
    '  --slug <slug>     Human-readable kebab-case slug. Required for research — the tool fills'
  );
  console.info(
    "                    in today's date; the path becomes specs/<scope>/research/<yyyy-mm-dd>-<slug>.research.md."
  );
  console.info(
    '  --out <path>      Explicit target path. Never replaces task --id; infers task --scope and'
  );
  console.info(
    '                    deepest declared --module from one canonical ownership chain. Task'
  );
  console.info(
    '                    paths are repo-relative, below specs/, and contain no symlink component;'
  );
  console.info('                    explicit --scope/--module only verify that proven owner.');
  console.info('  --list            Print every known kind with its path pattern and exit.');
  console.info(
    '  --manifest        Print the section manifest for <kind> and exit — no file is created,'
  );
  console.info('                    --scope/--module/--id are not required with this flag.');
  console.info('');
  console.info('Behavior:');
  console.info(
    "  Computes the target path from the kind's convention (or --out), refuses to overwrite an"
  );
  console.info(
    '  existing file (non-zero exit), creates missing parent directories, and writes the literal'
  );
  console.info(
    '  skeleton. On success, prints the created path plus a section manifest — name, REQUIRED/'
  );
  console.info(
    '  OPTIONAL, FOLD, and what to fill — the contract an agent reads before authoring the artifact.'
  );
  console.info(
    '  Before creating a task, proves scope type and exact Module Map ↔ module-spec closure; infrastructure is'
  );
  console.info(
    '  the sole flat-scope exception. Ghost modules and ownership conflicts fail closed.'
  );
  console.info('');
  console.info('Output:');
  console.info('  On success — created-path + section manifest table on stdout, exit 0.');
  console.info(
    '  With --manifest — the same section manifest table on stdout, exit 0, no file touched.'
  );
  console.info(
    '  On failure — an actionable diagnostic on stdout, never empty, with a non-zero exit:'
  );
  console.info('    1 file exists / write failed   4 bad invocation / unknown kind');
  console.info(
    '  Unknown, missing-value, or repeated options fail before filesystem access; every option is single-use.'
  );
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady sdd-new product --scope backend');
  console.info('  npx gennady sdd-new module --scope backend --module auth');
  console.info('  npx gennady sdd-new task --scope backend --module auth --id AUTH-login-flow');
  console.info(
    '  npx gennady sdd-new task --scope backend --id AUTH-login-flow --out custom/login.task.md'
  );
  console.info('  npx gennady sdd-new research --scope backend --slug ai-tooling-stack');
  console.info('  npx gennady sdd-new module-index --scope backend --module auth');
  console.info('  npx gennady sdd-new scope-index --scope backend');
  console.info('  npx gennady sdd-new project-index');
  console.info('  npx gennady sdd-new --list');
  console.info('  npx gennady sdd-new module --manifest');
}
