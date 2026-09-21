// @file: VCS user identity shape shared across GitLab/GitHub clients.
// @spec: VCS-VCS-CLIENT
// @consumers: VcsClient

/** @purpose Authenticated VCS user identity surfaced to API consumers. */
export type VcsUser = {
  /** @purpose Display name of the VCS user */
  name: string;
  /** @purpose Unique login identifier in the VCS system */
  login: string;
};
