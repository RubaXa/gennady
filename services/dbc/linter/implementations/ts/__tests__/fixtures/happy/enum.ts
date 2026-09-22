// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/happy/enum.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/** @purpose Order lifecycle states. */
export enum OrderState {
  /** @purpose Initial state. */
  NEW = 'NEW',
  /** @purpose Order has been paid. */
  PAID = 'PAID',
}
