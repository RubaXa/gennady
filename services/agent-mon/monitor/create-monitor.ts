// @file: Factory function for AgentMonitor instantiation
// @consumers: CLI, agent-mon barrel
// @tasks: TSK-36

import { AgentMonitor } from './agent-monitor.ts';

/**
 * @purpose Create a fresh AgentMonitor instance with an empty provider registry.
 * @returns A new AgentMonitor ready for provider registration.
 */
export function createMonitor(): AgentMonitor {
  return new AgentMonitor();
}
