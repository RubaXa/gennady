export const parseArgs = (argv, schema) => {
    const params = {};
    const argsList = argv.slice(2);
    
    argsList.forEach(arg => {
        if (arg.startsWith('-')) {
            const cleanArg = arg.replace(/^-+/, '');
            const [key, value] = cleanArg.split('=');
            
            for (const [optionKey, aliases] of Object.entries(schema)) {
                if (aliases.includes(key)) {
                    params[optionKey] = value
                        ? value.replace(/^"|"$/g, '')
                        : true;
                    break;
                }
            }
        }
    });
    
    return params;
}