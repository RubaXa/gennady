// @file: Schema-driven OpenCode test adapter for real-VCS acceptance runs.
// @consumers: gennady inbox serve --mock-opencode
// @tasks: TSK-175

import type { PromptOpts } from './opencode.port.ts';
import type { OpenCodeCallResult } from './errors.ts';
import { OpenCodeMock } from './opencode.mock.ts';

/** @purpose Parsed control-slot request embedded in the production prompt. */
type ControlSlotInput = {
  sourceId?: string;
  sourceTarget?: string;
  requiredFields?: string[];
};

const SIDEBAR_REVIEW_DIAGRAMS = [
  {
    kind: 'change-map',
    title: 'Карта изменения',
    caption: 'Что изменилось: флаг включает подписи в компактной боковой панели.',
    nodes: [
      { id: 'flag', label: 'Feature flag', detail: 'WORKSPACE_SIDEBAR_LABELS', tone: 'changed' },
      { id: 'sidebar', label: 'Sidebar', detail: 'ширина и компоновка', tone: 'changed' },
      { id: 'nav', label: 'SidebarNav', detail: 'выбор подписи', tone: 'changed' },
      { id: 'content', label: 'NavContent', detail: 'иконка + подпись', tone: 'changed' },
    ],
    edges: [
      { from: 'flag', to: 'sidebar', label: 'showLabels' },
      { from: 'sidebar', to: 'nav', label: 'prop' },
      { from: 'nav', to: 'content', label: 'name' },
    ],
  },
  {
    kind: 'c4',
    title: 'C4 · архитектура',
    caption: 'Где изменение находится относительно удалённых флагов и навигации Workspace.',
    nodes: [
      { id: 'remote', label: 'Remote features', detail: 'внешняя система', tone: 'external' },
      { id: 'registry', label: 'FEATURE registry', detail: 'featureFlags.ts' },
      { id: 'shell', label: 'Workspace Sidebar', detail: 'контейнер интерфейса', tone: 'changed' },
      { id: 'apps', label: 'Mini-app navigation', detail: 'ссылки приложений' },
    ],
    edges: [
      { from: 'remote', to: 'registry', label: 'features.has' },
      { from: 'registry', to: 'shell', label: 'boolean' },
      { from: 'shell', to: 'apps', label: 'render' },
    ],
  },
  {
    kind: 'behaviour',
    title: 'Поведение · поток данных',
    caption: 'Как значение флага превращается в видимую подпись пункта навигации.',
    nodes: [
      { id: 'has', label: 'features.has(…)' },
      { id: 'show', label: 'showLabels', detail: 'Sidebar → SidebarNav' },
      { id: 'label', label: 'getSidebarNavLabel', detail: 'короткое имя' },
      { id: 'visible', label: 'labelVisible', detail: 'compact sidebar', tone: 'changed' },
    ],
    edges: [
      { from: 'has', to: 'show', label: 'boolean' },
      { from: 'show', to: 'label', label: 'name' },
      { from: 'label', to: 'visible', label: 'render' },
    ],
  },
  {
    kind: 'use-cases',
    title: 'Сценарии · зачем',
    caption: 'Пользователь распознаёт приложения, не раскрывая боковую панель.',
    nodes: [
      { id: 'user', label: 'Сотрудник', detail: 'actor', tone: 'actor' },
      { id: 'compact', label: 'Компактная панель', detail: 'иконки + подписи', tone: 'scenario' },
      { id: 'recognize', label: 'Распознать приложение', detail: 'без hover' },
      { id: 'open', label: 'Открыть mini-app', detail: 'целевое действие' },
    ],
    edges: [
      { from: 'user', to: 'compact' },
      { from: 'compact', to: 'recognize', label: 'подпись' },
      { from: 'recognize', to: 'open' },
    ],
  },
] as const;

/** @purpose Dynamically satisfy production schemas while retaining an unmistakable mock marker. */
export class OpenCodeDynamicMock extends OpenCodeMock {
  /**
   * @param sid Session id for the mock prompt.
   * @param opts Prompt options carrying format/tool-call schemas.
   * @returns Mock prompt result shaped to the production schema.
   * @see {OpenCodeMock#prompt}
   */
  override async prompt(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    const title = opts.format?.schema?.title;
    if (title === 'pipeline_control_slot') {
      const input = this._parseControlInput(opts.text ?? '');
      const fields = Object.fromEntries(
        (input.requiredFields ?? []).map((field) => [
          field,
          `MOCK_AI: derived from immutable source ${input.sourceId ?? 'unknown'}`,
        ])
      );
      this.seed(title, {
        sourceId: input.sourceId ?? 'unknown',
        content: `MOCK_AI: contract slot synthesized from ${input.sourceTarget ?? 'immutable source'}`,
        fields,
      });
      if (input.sourceTarget) this.seedToolCalls(title, [input.sourceTarget]);
    } else if (typeof title === 'string' && title.startsWith('pipeline_')) {
      const fileList = /files:\s*(.*?)\s*—/u.exec(opts.text ?? '')?.[1] ?? '';
      const files = fileList
        .split(',')
        .map((file) => file.trim())
        .filter((file) => file && file !== '(no changed files)');
      const findings = files.includes('src/components/Sidebar/Sidebar.tsx')
        ? [
            {
              file: 'src/components/Sidebar/Sidebar.tsx',
              line: 47,
              severity: 'warning',
              summary:
                'Клик по логотипу перезагружает SPA: новый обработчик больше не вызывает preventDefault()',
              factcheck: 'verified',
              diff: [
                {
                  type: 'remove',
                  num: 17,
                  text: 'const handleSidebarLogo = (event: React.MouseEvent<HTMLAnchorElement>) => {',
                },
                { type: 'remove', num: 18, text: 'event.preventDefault();' },
                { type: 'add', num: 17, text: 'const handleSidebarLogo = () => {' },
                { type: 'add', num: 18, text: "xray.send('sidebar_logo_click');" },
                {
                  type: 'context',
                  num: 47,
                  text: '<a href="" className={styles.logo} onClick={handleSidebarLogo}>',
                },
              ],
            },
          ]
        : [];
      this.seed(title, {
        findings,
        diagrams: files.includes('src/components/Sidebar/Sidebar.tsx')
          ? SIDEBAR_REVIEW_DIAGRAMS
          : [],
        report: [
          `# ${title.replace(/^pipeline_/, '').replaceAll('_', ' ')}`,
          '',
          '> MOCK_AI: динамический ответ для проверки полного сетевого и UI-контракта.',
          '',
          '## Проверенный scope',
          '',
          ...(files.length ? files.map((file) => `- \`${file}\``) : ['- Нет применимых файлов']),
          '',
          '## Результат',
          '',
          ...(findings.length
            ? [
                'Найдена регрессия навигации: пустой `href` снова выполняет действие браузера, потому что новый обработчик не отменяет событие.',
              ]
            : ['Замечаний, требующих публикации, не найдено.']),
        ].join('\n'),
      });
      if (files.length) this.seedToolCalls(title, files);
    }
    return super.prompt(sid, opts);
  }

  /**
   * @purpose Decode only the bounded JSON envelope emitted by PipelineRuntime.
   * @param text Raw JSON envelope text.
   * @returns Parsed control-slot input with fallback fields.
   */
  protected _parseControlInput(text: string): ControlSlotInput {
    try {
      const parsed = JSON.parse(text) as ControlSlotInput;
      return {
        sourceId: typeof parsed.sourceId === 'string' ? parsed.sourceId : undefined,
        sourceTarget: typeof parsed.sourceTarget === 'string' ? parsed.sourceTarget : undefined,
        requiredFields: Array.isArray(parsed.requiredFields)
          ? parsed.requiredFields.filter((field): field is string => typeof field === 'string')
          : [],
      };
    } catch {
      return {};
    }
  }
}
