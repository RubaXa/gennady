// @file: Shared utility helpers for inbox-dashboard — cn(), class merging, formatting.
// @consumers: inbox-dashboard components
// @tasks: TSK-107

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * @purpose Merge Tailwind classes with conflict resolution via tailwind-merge.
 * @param inputs Class values to merge.
 * @returns Resolved className string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * @purpose Format a relative time string from an ISO timestamp.
 * @param iso ISO 8601 timestamp string.
 * @returns Human-readable relative time (e.g. "2h ago", "3d ago").
 */
export function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * @purpose Extract MR ID from a composite key like "group/project!510".
 * @param key Composite MR key.
 * @returns Numeric IID.
 */
export function extractMrIid(key: string): number {
  const parts = key.split('!');
  return parseInt(parts[parts.length - 1] ?? '0', 10);
}
