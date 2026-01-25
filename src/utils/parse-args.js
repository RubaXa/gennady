export const parseArgs = (argv, schema = {}) => {
    const params = { _: [] };
    const argsList = argv.slice(2);
    
    argsList.forEach(arg => {
        if (arg.startsWith('-')) {
            const cleanArg = arg.replace(/^-+/, '');
            const [key, value] = cleanArg.split('=');
            
            for (const [optionKey, aliases] of Object.entries(schema)) {
                if (aliases.includes(key)) {
                    const normValue = value ? value.replace(/^"|"$/g, '') : true;

                    if (optionKey in params) {
                        if (!Array.isArray(params[optionKey])) {
                            params[optionKey] = [params[optionKey]];
                        }
                        
                        params[optionKey].push(normValue);
                    } else {
                        params[optionKey] = normValue;
                    }
                    break;
                }
            }
        } else {
            params._.push(arg);
        }
    });
    
    return params;
}