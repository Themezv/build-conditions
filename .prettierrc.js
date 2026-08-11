module.exports = {
    arrowParens: 'avoid',
    bracketSpacing: true,
    bracketSameLine: false,
    jsxSingleQuote: false,
    endOfLine: 'lf',
    printWidth: 120,
    singleQuote: true,
    quoteProps: 'as-needed',
    tabWidth: 4,
    useTabs: false,
    trailingComma: 'es5',
    semi: true,
    proseWrap: 'preserve',
    singleAttributePerLine: false,
    htmlWhitespaceSensitivity: 'css',
    overrides: [
        {
            files: ['*.yml', '*.yaml'],
            options: {
                tabWidth: 2,
            },
        },
    ],
};
