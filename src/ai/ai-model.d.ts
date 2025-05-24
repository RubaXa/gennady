/** AI Model (LLM) init params #AI_MODEL_INIT */
export type AiModelInit = {
    model: string;
    url: string;
    key?: string;
};

/** AI Model (LLM) #AI_MODEL_CLASS */
export class AiModel {
    /** Default AI Model #AI_MODEL_DEFAULT */
    static getDefault(): AiModel;

    /** Constructor #AI_MODEL_CONSTRUCTOR */
    constructor(init: AiModelInit);

    /** Model identifier/name #AI_MODEL_MODEL_NAME */
    readonly name: string;

    /** API endpoint URL #AI_MODEL_URL */
    readonly url: string;

    /** API authentication key #AI_MODEL_KEY */
    readonly key: string | undefined;

    /** Ping AI Model #AI_MODEL_PING */
    ping(timeout?: number): Promise<[boolean, null] | [null, Error]>;

    /** Generate LLM response #AI_MODEL_GENERATE */
    generate(
        prompt: string,
        init?: {
            context?: string;
            temperature?: number;
            timeout?: number;
        }
    ): Promise<[string, null] | [null, Error]>;
}
