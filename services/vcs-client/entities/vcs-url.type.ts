// @file: VCS URL value object — parsed GitLab MR / GitHub PR URL result.
// @consumers: parseVcsUrl, VcsClient factory
// @tasks: TSK-27

/**
 * @purpose Результат парсинга URL merge request / pull request.
 * @consumer parseVcsUrl
 */
export type VcsUrl = {
  /** @purpose VCS-провайдер: gitlab или github */
  provider: 'gitlab' | 'github';
  /** @purpose Хост (с портом если есть): gitlab.com, github.internal.com:8443 */
  host: string;
  /** @purpose Идентификатор репозитория: group/project для GitLab, owner/repo для GitHub */
  repository: string;
  /** @purpose Номер MR (IID) или PR (number) */
  iid: number;
};
