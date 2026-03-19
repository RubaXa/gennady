import type { AIModel } from '../ai-model.type.ts';

/**
 * @purpose Open Router GET /models API response item (full schema).
 * @see {AIModel} in ./ai-model.type.ts
 */
export type OpenRouterModel = AIModel & {
  canonical_slug: string;
  context_length: number;
  architecture: {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
    instruct_type: string | null;
  };
  pricing: { prompt: string; completion: string };
  top_provider: {
    context_length: number;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  per_request_limits: unknown;
  supported_parameters: string[];
  default_parameters: Record<string, unknown>;
  expiration_date: unknown;
};
