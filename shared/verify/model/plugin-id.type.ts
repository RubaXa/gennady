// @file: Open identifier shared by verify plugins and their data contracts.
// @consumers: verify model, legacy stack compatibility types
// @spec: CLI-VERIFY

/** @purpose Identify a verify plugin without constraining core to the built-in registry. */
export type PluginId = string;
