// @file: Exhaustive cleanup of one owned calibration attempt, independent of persistence failures.
// @spec: AI-SKILLS
// @consumers: semantic calibration runner; failure-path regression tests

export type AuthoringCalibrationCleanup = {
  sessions: string[];
  temporaryDirectoryRemoved: boolean;
  errors: Array<{ stage: string; reason: string }>;
};

/** @purpose Attempt every release operation even if saving or stopping an earlier resource fails. */
export async function finalizeAuthoringCalibration(input: {
  sessions: readonly string[];
  persist: () => void;
  abort: (session: string) => Promise<void>;
  removeSession: (session: string) => Promise<void>;
  removeDirectory: () => void;
  safeReason: (cause: unknown) => string;
}): Promise<AuthoringCalibrationCleanup> {
  const result: AuthoringCalibrationCleanup = {
    sessions: [...input.sessions],
    temporaryDirectoryRemoved: false,
    errors: [],
  };
  const attempt = async (stage: string, action: () => unknown) => {
    try {
      await action();
    } catch (cause) {
      result.errors.push({ stage, reason: input.safeReason(cause) });
    }
  };
  await attempt('persist-before-cleanup', input.persist);
  for (const id of input.sessions) {
    await attempt(`abort:${id}`, () => input.abort(id));
    await attempt(`delete:${id}`, () => input.removeSession(id));
  }
  await attempt('remove-directory', () => {
    input.removeDirectory();
    result.temporaryDirectoryRemoved = true;
  });
  return result;
}
