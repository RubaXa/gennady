// @file: macOS-only common shell carrier: clean environment, private/home read denial, read-only toolchain exceptions.
// @spec: AI-SKILLS
// @consumers: finite execution-autonomy controller and no-model shell canary

import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

/** @purpose Materialize a host-owned shell boundary outside worker write zones; not a general OS sandbox framework.
 * @param options Exact host-owned paths and a minimal executable search path, never provider credentials.
 * @returns Config shell/plugin entries shared by both product-runtime arms.
 */
export function createExecutionShellCarrier(options: {
  /** @purpose Newly owned directory containing immutable wrapper/profile/plugin files. */
  directory: string;
  /** @purpose Actual user home denied to shell descendants, without opening its private files. */
  hostHome: string;
  /** @purpose Exact canonical package/toolchain directories permitted for reads, never writes. */
  allowedReadRoots: readonly string[];
  /** @purpose Additional private provider/config/state roots denied even outside the user home. */
  privateRoots: readonly string[];
  /** @purpose Exact owned parent of freshly provisioned sdd-flow-eval-* checkout directories. */
  workspaceRoot: string;
  /** @purpose Host-selected executable directories; no inherited environment is copied. */
  path: string;
}): {
  /** @purpose Absolute host-owned bash wrapper selected by the OpenCode config. */
  shell: string;
  /** @purpose Local host-owned shell.env plugin file. */
  plugin: string;
  /** @purpose Private directory receiving per-checkout immutable sandbox profiles. */
  profileDirectory: string;
  /** @purpose Minimal noncredential shell settings, not inherited process state. */
  environment: Record<string, string>;
} {
  if (process.platform !== 'darwin')
    throw new Error('Execution shell carrier requires macOS sandbox-exec');
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  const home = realpathSync(options.hostHome);
  const reads = [...new Set(options.allowedReadRoots.map((root) => realpathSync(root)))];
  for (const root of reads) {
    const relation = relative(root, home);
    if (
      relation === '' ||
      (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation))
    )
      throw new Error('Toolchain read exception must not include the user home or an ancestor');
  }
  const directory = realpathSync(options.directory);
  const protectedRoots = [
    ...new Set([directory, ...options.privateRoots.map((root) => realpathSync(root))]),
  ];
  const workspaceRoot = realpathSync(options.workspaceRoot);
  const metadataAncestors = new Set<string>();
  for (const root of reads) {
    let ancestor = dirname(root);
    while (ancestor === home || ancestor.startsWith(home + sep)) {
      metadataAncestors.add(ancestor);
      if (ancestor === home) break;
      ancestor = dirname(ancestor);
    }
  }
  const profileDirectory = join(directory, 'profiles');
  mkdirSync(profileDirectory, { mode: 0o700 });
  // The basename is deliberately bash: both Shell.preferred and the AI tool's Shell.acceptable
  // must select this wrapper rather than falling back from an unrecognized shell name.
  const shell = join(directory, 'bash');
  const plugin = join(directory, 'clean-env.mjs');
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const env = { PATH: options.path, NO_COLOR: '1', SHELL: shell };
  const profileBase = `(version 1)
(allow default)
(deny file-write* (subpath ${JSON.stringify(home)}))
(deny file-read* (require-all (subpath ${JSON.stringify(home)}) ${reads.map((root) => `(require-not (subpath ${JSON.stringify(root)}))`).join(' ')}))
${[...metadataAncestors].map((root) => `(allow file-read-metadata (literal ${JSON.stringify(root)}))`).join('\n')}
${protectedRoots.map((root) => `(deny file-read* file-write* (subpath ${JSON.stringify(root)}))`).join('\n')}
(deny network*)
(deny process-info*)
(allow process-info* (target self))
`;
  writeFileSync(
    shell,
    `#!/bin/sh
test -n "$GENNADY_EXECUTION_PROFILE" && test -n "$GENNADY_EXECUTION_HOME" && test -n "$GENNADY_EXECUTION_TMP" || exit 78
exec /usr/bin/sandbox-exec -f "$GENNADY_EXECUTION_PROFILE" /usr/bin/env -i ${Object.entries(env)
      .map(([key, value]) => `${key}=${quote(value)}`)
      .join(' ')} HOME="$GENNADY_EXECUTION_HOME" TMPDIR="$GENNADY_EXECUTION_TMP" /bin/bash "$@"
`,
    { mode: 0o700 }
  );
  writeFileSync(
    plugin,
    `import {mkdirSync,realpathSync,writeFileSync} from 'node:fs';
import {join,relative,sep,isAbsolute} from 'node:path';
export const CleanExecutionEnvironment = async () => ({
  'shell.env': async (input, output) => {
    const root=${JSON.stringify(workspaceRoot)};
    const cwd=realpathSync(input.cwd);
    const rel=relative(root,cwd);
    const name=rel.split(sep)[0];
    if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep)||!/^sdd-flow-eval-[A-Za-z0-9_-]+$/.test(name)) throw new Error('Shell cwd is not an owned execution checkout');
    const checkout=realpathSync(join(root,name));
    if(checkout!==join(root,name)) throw new Error('Shell checkout alias is not an owned direct child');
    const home=join(checkout,'.sdd-eval-shell-home');
    const tmp=join(checkout,'.sdd-eval-shell-tmp');
    mkdirSync(home,{recursive:true,mode:0o700}); mkdirSync(tmp,{recursive:true,mode:0o700});
    const profile=join(${JSON.stringify(profileDirectory)},name+'.sb');
    const writes='(deny file-write* (require-all (require-not (subpath '+JSON.stringify(checkout)+')) (require-not (literal "/dev/null"))))\\n';
    writeFileSync(profile,${JSON.stringify(profileBase)}+writes,{mode:0o600});
    for (const key of Object.keys(process.env)) output.env[key] = undefined;
    Object.assign(output.env, ${JSON.stringify(env)}, {HOME:home,TMPDIR:tmp,GENNADY_EXECUTION_PROFILE:profile,GENNADY_EXECUTION_HOME:home,GENNADY_EXECUTION_TMP:tmp});
  }
});\n`,
    { mode: 0o600 }
  );
  return { shell, plugin, profileDirectory, environment: env };
}
