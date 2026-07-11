// @file: vcs-validators — shared URL validation for SSRF prevention in agent-inbox serve-mode.
// @consumers: BoardProviderReal, RoleScheduler, VcsInboxReal
// @tasks: TSK-113, TSK-117

/**
 * @purpose SSRF-safe MR URL validator. Checks HTTPS, host match, MR path. Skips host when vcsHost empty.
 * @param url The MR URL to validate.
 * @param vcsHost The configured VCS hostname. Empty for mock/dev mode.
 * @returns True if the URL is valid and safe to use.
 */
export function isValidMrUrl(url: string, vcsHost: string): boolean {
  try {
    const u = new URL(url);

    // Protocol must be HTTPS
    if (u.protocol !== 'https:') return false;

    // Host must match the configured VCS host (skip in mock/dev mode when vcsHost is empty)
    if (vcsHost && u.hostname !== vcsHost) return false;

    // Path must match GitLab MR URL pattern: /<project>/-/merge_requests/<iid>
    const mrPattern = /^\/(.+?)\/-\/merge_requests\/\d+/;
    return mrPattern.test(u.pathname);
  } catch {
    return false;
  }
}
