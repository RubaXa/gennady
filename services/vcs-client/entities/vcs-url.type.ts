// @file: VCS URL value object — parsed GitLab MR / GitHub PR URL result.
// @consumers: parseVcsUrl, VcsClient factory
// @tasks: TSK-27

/**
 * @purpose Parsed merge request / pull request URL result.
 * @consumer parseVcsUrl
 */
export type VcsUrl = {
  /** @purpose VCS provider: gitlab or github */
  provider: 'gitlab' | 'github';
  /** @purpose Host (with port if present): gitlab.com, github.internal.com:8443 */
  host: string;
  /** @purpose Repository identifier: group/project for GitLab, owner/repo for GitHub */
  repository: string;
  /** @purpose MR number (IID) or PR (number) */
  iid: number;
};
