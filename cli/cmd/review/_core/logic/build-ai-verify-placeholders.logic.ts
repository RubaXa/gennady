import { resolveSafeVerifyCommands } from './verify-commands/resolve-verify-commands.logic.ts';

export type VerifyCommandPlaceholders = {
  /** Фрагмент после «используй» в аксиоме AX_PRAGMATIC_TDD (точка снаружи в XML). */
  axiomHint: string;
  /** Содержимое скобок в Secondary_Tools — примеры команд терминала для *проверки*, не git. */
  toolsExample: string;
  /** Полная строка пункта Verify в STEP_4 (без префикса «2. **Verify:**»). */
  verifyStep: string;
};

function formatCommandList(commands: string[]): string {
  return commands.map((c) => `\`${c}\``).join(', ');
}

/**
 * @purpose Подстановки `<!--ai:verify-*-->`: только проверка кода; при неуверенности — README/CI без опасных сборок.
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
