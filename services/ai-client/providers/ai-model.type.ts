// @file: Generic model descriptor from any provider (Open Router, LLM proxy, etc.).
// @consumers: open-router-model.type, open-router-provider
// @tasks: N/A

/**
 * @purpose Generic model descriptor from any provider (Open Router, LLM proxy, etc.).
 * @behavior Only id and name are guaranteed; other fields depend on the source.
 */
export type AIModel = {
  /** @purpose Unique model identifier string */
  id: string;
  /** @purpose Human-readable model name */
  name: string;
  /** @purpose Optional model description text */
  description?: string;
  /** @purpose Pricing info with optional prompt and completion costs */
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  /** @purpose Top provider metadata */
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number | null;
    is_moderated?: boolean;
  };
  /** @purpose Canonical slug for the model */
  canonical_slug?: string;
  /** @purpose Hugging Face model identifier */
  hugging_face_id?: string;
  /** @purpose Model creation timestamp */
  created?: number;
  /** @purpose Context window length in tokens */
  context_length?: number;
  /** @purpose Model architecture details */
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string | null;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  /** @purpose Per-request rate limiting info */
  per_request_limits?: unknown;
  /** @purpose Supported generation parameters */
  supported_parameters?: string[];
  /** @purpose Default parameter overrides */
  default_parameters?: Record<string, unknown>;
  /** @purpose Model expiration date info */
  expiration_date?: unknown;
};
