// @file: Fixture service for orient command tests.
// @consumers: FixtureConsumer
// @tasks: TSK-60

/**
 * @purpose Fixture service with exported contract for orient discovery.
 */
export class FixtureService {
  /**
   * @purpose Compute a transformed value from numeric input.
   * @param input Numeric value to transform.
   * @returns Input multiplied by 2.
   */
  compute(input: number): number {
    return input * 2;
  }
}
