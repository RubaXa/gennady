// @file: Type definitions for telegram data ores
// @consumers: telegram-data-ore
// @tasks: N/A

/**
 * @purpose Query parameters for fetching Telegram dialogs.
 */
export type DialogsQuery = {
  /** @purpose Maximum number of dialogs to return */
  limit?: number;
  /** @purpose Whether to include archived chats */
  includedArchived?: boolean;
};

/**
 * @purpose Query parameters for date-range based filtering (placeholder for future use).
 */
export type RangeQuery = {};
