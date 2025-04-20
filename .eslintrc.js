module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    'no-console': 'off',
    'require-yield': 0,
    'no-undef': 'off',
    'no-var': 'off',
    'prefer-const': 'off',

    '@typescript-eslint/no-unused-vars': ['warn', {
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_',
      'caughtErrorsIgnorePattern': '^_'
    }]
  },
  env: {
    node: true,
    es6: true
  },
  globals: {
    Buffer: true,
    TextEncoder: true,
    TextDecoder: true
  },
  ignorePatterns: ['dist/**/*']
};
