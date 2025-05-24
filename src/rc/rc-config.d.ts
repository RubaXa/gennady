/** Gennady RC data #GENNADY_RC_DATA */
export type RcModel = {
    model: string;
    url: string;
    key?: string;
};

/** Gennady RC (configuration) #GENNADY_RC_CLASS */
export class GennadyRc {
    /** Default Gennady RC filename #GENNADY_RC_DEFAULT_FILENAME */
    static readonly DEFAULT_FILENAME: string;

    /** Get default rc configs #GENNADY_RC_GET_DEFAULTS */
    static getDefaults(): GennadyRc[];

    /** Load rc config #GENNADY_RC_LOAD */
    static load(path?: string): GennadyRc;

    /** Constructor #GENNADY_RC_CONSTRUCTOR */
    constructor(dir?: string, filename?: string);

    /** Check if config is valid #GENNADY_RC_METHOD_IS_VALID */
    isValid(): boolean;

    /** Get AI Models config #GENNADY_RC_METHOD_GET_MODELS */
    getModels(): RcModel[];

    /** Get config parse error #GENNADY_RC_GET_ERROR */
    getError(): Error | null;
}
