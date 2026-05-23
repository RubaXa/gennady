// @file: Initial review request intent: explicit MR or branch search.
// @consumers: load-review-context-mr.logic, resolve-review-intent.logic, run-review-command.logic
// @tasks: N/A

/**
 * @purpose Initial review request intent: explicit MR or branch search.
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
