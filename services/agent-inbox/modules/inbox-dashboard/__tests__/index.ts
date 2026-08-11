// @file: directory index — resolves __tests__/ as an ES module so node:test can spawn a child
// process for directory arguments (e.g. `npm test -- __tests__/`).
// @consumers: node:test (directory import resolution via tsx loader)
// @tasks: TSK-182

export {};
