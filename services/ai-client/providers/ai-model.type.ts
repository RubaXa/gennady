/**
 * @purpose Generic model descriptor from any provider (Open Router, LLM proxy, etc.).
 * @behavior Only id and name are guaranteed; other fields depend on the source.
 */
export type AIModel = {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number | null;
    is_moderated?: boolean;
  };
  canonical_slug?: string;
  hugging_face_id?: string;
  created?: number;
  context_length?: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string | null;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  per_request_limits?: unknown;
  supported_parameters?: string[];
  default_parameters?: Record<string, unknown>;
  expiration_date?: unknown;
};
