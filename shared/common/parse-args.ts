// @file: Parse command-line arguments by options schema and aliases.
// @consumers: cat.cmd, commit.cmd, lint.cmd, parse-review-command-args.logic, remote-console.cmd, resolve-conflicts-command-args-parse.logic, review.cmd, vcs-reply, vcs-reply.cmd
// @tasks: N/A

/**
 * @purpose Parse command-line arguments by options schema and aliases.
 * @consumer CLI (gennady, cmd/*)
 */
export const parseArgs = <T extends Record<string, string[]>>(
  argv: string[],
  schema: T = {} as T
): Record<keyof T | '_', unknown> & { _: string[] } => {
  const params: Record<string, unknown> & { _: string[] } = { _: [] };
  const argsList = argv.slice(2);

  argsList.forEach((arg) => {
    if (arg.startsWith('-')) {
      const cleanArg = arg.replace(/^-+/, '');
      const [key, value] = cleanArg.split('=');

      for (const [optionKey, aliases] of Object.entries(schema)) {
        if (Array.isArray(aliases) && key && aliases.includes(key)) {
          const normValue = value ? value.replace(/^"|"$/g, '') : true;

          if (optionKey in params) {
            if (!Array.isArray(params[optionKey])) {
              params[optionKey] = [params[optionKey]];
            }
            (params[optionKey] as unknown[]).push(normValue);
          } else {
            params[optionKey] = normValue;
          }
          break;
        }
      }
    } else {
      params._.push(arg);
    }
  });

  return params as Record<keyof T | '_', unknown> & { _: string[] };
};
