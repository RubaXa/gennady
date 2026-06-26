// @file: Parse command-line arguments by options schema and aliases.
// @consumers: cat.cmd, commit.cmd, lint.cmd, parse-review-command-args.logic, remote-console.cmd, resolve-conflicts-command-args-parse.logic, review.cmd, vcs-reply, vcs-reply.cmd
// @tasks: N/A, TSK-80

/**
 * @purpose Parse command-line arguments by options schema and aliases.
 * @consumer CLI (gennady, cmd/*)
 */
export const parseArgs = <T extends Record<string, unknown>>(
  argv: string[],
  schema: T = {} as T
): Record<keyof T | '_', unknown> & { _: string[] } => {
  const params: Record<string, unknown> & { _: string[] } = { _: [] };
  const argsList = argv.slice(2);

  for (let i = 0; i < argsList.length; i++) {
    const arg = argsList[i];
    if (arg.startsWith('-')) {
      const cleanArg = arg.replace(/^-+/, '');
      const [key, value] = cleanArg.split('=');

      for (const [optionKey, schemaEntry] of Object.entries(schema)) {
        const aliases: string[] = Array.isArray(schemaEntry)
          ? (schemaEntry as string[])
          : ((schemaEntry as { aliases: string[] }).aliases ?? [optionKey]);
        if (aliases && key && aliases.includes(key)) {
          const takesValue =
            typeof schemaEntry === 'object' && !Array.isArray(schemaEntry)
              ? (schemaEntry as { takesValue?: boolean }).takesValue === true
              : false;

          let normValue: unknown;

          if (value !== undefined) {
            normValue = value.replace(/^"|"$/g, '');
          } else if (takesValue && i + 1 < argsList.length && !argsList[i + 1].startsWith('-')) {
            normValue = argsList[i + 1];
            i++;
          } else {
            normValue = true;
          }

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
  }

  return params as Record<keyof T | '_', unknown> & { _: string[] };
};
