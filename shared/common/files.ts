// @file: Determine whether a file is a test file by naming conventions.
// @consumers: git-core
// @tasks: N/A

/**
 * @purpose Determine whether a file is a test file by naming conventions.
 * @consumer core/utils
 */
export const isTestFile = (filename: string): boolean => {
  return /\.(test|spec)s?\./.test(filename);
};
