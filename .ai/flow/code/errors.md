# Errors (LLD)

Use this flow when the agent is **throwing, rethrowing, or formatting errors**.

## Error construction
- Error messages must include anchor:
  - `new Error("[Class#method] Message", { cause })`
  - `new Error("[functionName] Message", { cause })`
- `cause` may contain any value type; do not coerce it.
- Preserve original context when rethrowing.

## In catch blocks
1. Log with `logger.error` (see [logging.md](./logging.md)).
2. Then throw with anchor and `{ cause }` as above.

Example: see the catch block in [logging.md § Minimal example](./logging.md#6-minimal-example).
