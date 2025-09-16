module.exports = {
    env: {
        node: true,
        es2022: true,
    },
    extends: [
        'eslint:recommended'
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
    },
    rules: {
        // Reglas básicas recomendadas
        'no-console': 'off', // Permitir console.log en un bot de Discord
        'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
        'prefer-const': 'warn',
        'no-var': 'error',
        'eqeqeq': 'warn',
        'curly': 'warn',
        'semi': ['warn', 'always'],
        'quotes': ['warn', 'single', { 'allowTemplateLiterals': true }],
        'indent': ['warn', 4],
        'no-trailing-spaces': 'warn',
        'comma-dangle': ['warn', 'never'],
        'object-curly-spacing': ['warn', 'always'],
        'array-bracket-spacing': ['warn', 'never'],
        'space-before-blocks': 'warn',
        'keyword-spacing': 'warn'
    },
    ignorePatterns: [
        'node_modules/',
        'dist/',
        'build/',
        '*.min.js'
    ]
};