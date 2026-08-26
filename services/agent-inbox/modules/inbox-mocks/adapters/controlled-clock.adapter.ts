// @file: ControlledClockAdapter — re-export of ControlledClock under the inbox-mocks canonical name.
// @consumers: ReviewScenario, inbox-mocks test suite
// @tasks: TSK-180

export { ControlledClock as ControlledClockAdapter } from '../../inbox-core/adapters/controlled-clock.ts';
