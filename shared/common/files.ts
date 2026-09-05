// @file: Determine whether a file is a test file by naming conventions.
// @consumers: git-core
// @tasks: N/A

/**
 * @purpose Determine whether a file is a test file by naming conventions.
 * @consumer core/utils
 */
export const isTestFile = (filename: string): boolean => {
  return /\.(test|spec)s?(?:-helpers?)?\./.test(filename);
};

/**
 * @purpose Whether a path sits in test territory — inside `__tests__/`, `__mocks__/`, or
 *   `__fixtures__/` — where every legitimate consumer is itself a test.
 */
export const isUnderTestDirectory = (filename: string): boolean => {
  return /(^|[\\/])__(tests|mocks|fixtures)__([\\/]|$)/.test(filename);
};
