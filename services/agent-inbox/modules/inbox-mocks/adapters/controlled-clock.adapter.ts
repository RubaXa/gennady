// @file: ControlledClockAdapter — re-export of ControlledClock under the inbox-mocks canonical name.
// @spec: AGENT-INBOX-INBOX-MOCKS
// @consumers: ReviewScenario, inbox-mocks test suite

export { ControlledClock as ControlledClockAdapter } from '../../inbox-core/adapters/controlled-clock.ts';
