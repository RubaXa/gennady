// @file: Describe verify-block substitutions for the AI template.
// @consumers: render-review-verify.xml, resolve-conflicts-render.xml
// @tasks: N/A

import { resolveSafeVerifyCommands } from './verify-commands/resolve-verify-commands.logic.ts';

/**
 * @purpose Describe verify-block substitutions for the AI template.
 * @consumer render-review-verify.xml, render-resolve-conflicts.xml
 */
export type VerifyCommandPlaceholders = {
  /** @purpose Hint for agent on which verification command to run. */
  axiomHint: string;
  /** @purpose Example tool commands for the agent to reference. */
  toolsExample: string;
  /** @purpose Step-by-step verification instruction for the agent. */
  verifyStep: string;
};

function formatCommandList(commands: string[]): string {
  return commands.map((c) => `\`${c}\``).join(', ');
}

/**
 * @purpose Build safe `<!--ai:verify-*-->` substitutions for the template.
 * @param projectRoot Repository root for searching verification commands.
 * @returns Set of strings for insertion into the template.
 * @consumer render-review-verify.xml, render-resolve-conflicts.xml
 */
export function buildVerifyCommandPlaceholders(projectRoot: string): VerifyCommandPlaceholders {
  const commands = resolveSafeVerifyCommands(projectRoot);

  if (commands.length === 0) {
    return {
      axiomHint:
        'как в README или CI принято проверять код (тесты, линтер, типы). Не подменяй это тяжёлой production-сборкой или публикацией, если это явно не описано как проверка',
      toolsExample:
        'команды из `package.json` → `scripts`, из Makefile или из CI-шагов, которые относятся к качеству кода; сначала прочитай README',
      verifyStep:
        'Прочитай README и при наличии — конфиг CI: какие команды запускают тесты, линтер и проверку типов. Выполни их из корня репозитория. Не запускай `build`/`publish`/полный `ci`, если не уверен, что это нужно для проверки изменений; при сомнении спроси пользователя.',
    };
  }

  const listed = formatCommandList(commands);
  const first = commands[0];

  return {
    axiomHint: `\`${first}\` или следующую команду из того же набора проверок`,
    toolsExample: listed,
    verifyStep: `Из корня репозитория выполни: ${listed}. Не добавляй \`build\`, полный \`ci\` или публикацию, если они не перечислены здесь и не описаны в README как обязательная проверка.`,
  };
}
