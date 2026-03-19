import { listAvailableAdapters } from './integrations/agent-cli/agent-cli-registry.ts';

const results = await listAvailableAdapters();

console.info(results);
