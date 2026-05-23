// @file: SessionCard ink component — renders one agent session as a bordered card.
// @consumers: ProviderColumn
// @tasks: TSK-46

import { Box, Text } from 'ink';
import type { SessionCard as SessionCardData } from '../state/view-model.type.ts';
import { StatusBadge } from './status-badge.tsx';

/** @purpose Props for the SessionCard component — session data to render. */
export type SessionCardProps = {
  /** @purpose Session card data from the ViewModel */
  card: SessionCardData;
};

/**
 * @purpose Format token counts into a compact string.
 * @invariant Emits nothing when both counts are absent (degradation per spec).
 */
function formatTokens(inTokens?: number, outTokens?: number): string | undefined {
  if (inTokens === undefined && outTokens === undefined) return undefined;
  const parts: string[] = [];
  if (inTokens !== undefined) parts.push(`in:${(inTokens / 1000).toFixed(0)}k`);
  if (outTokens !== undefined) parts.push(`out:${(outTokens / 1000).toFixed(0)}k`);
  return parts.join(' ');
}

/**
 * @purpose Renders one agent session as a bordered card with status badge and metadata.
 * @invariant Absent optional fields (tokens, cpu, memory) are not rendered — degradation per spec.
 */
export function SessionCard({ card }: SessionCardProps) {
  const tokens = formatTokens(card.tokensIn, card.tokensOut);

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>{card.title}</Text>
      {card.model && <Text dimColor>{card.model}</Text>}
      <Box>
        <StatusBadge status={card.status} />
        <Text>  {card.elapsed}</Text>
      </Box>
      {tokens && <Text>{tokens}</Text>}
      {card.cpuPercent !== undefined && <Text>CPU: {card.cpuPercent}%</Text>}
      {card.memoryMb !== undefined && <Text>MEM: {card.memoryMb}MB</Text>}
      {card.lastMessage && <Text dimColor wrap="truncate-end">{card.lastMessage}</Text>}
    </Box>
  );
}
