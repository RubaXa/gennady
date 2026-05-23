// @file: Исходное намерение review-запроса: явный MR или поиск по ветке.
// @consumers: load-review-context-mr.logic, resolve-review-intent.logic, run-review-command.logic
// @tasks: N/A

/**
 * @purpose Исходное намерение review-запроса: явный MR или поиск по ветке.
 * @consumer resolve-review-intent.logic
 */
export type ReviewIntent =
  | {
      source: 'url';
      host: string;
      project: string;
      iid: string;
    }
  | {
      source: 'ref' | 'project-iid';
      project: string;
      iid: string;
    }
  | {
      source: 'branch';
      branch?: string;
    };
