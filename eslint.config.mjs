// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
      '@typescript-eslint/require-utf8-imports': 'off',

      'no-console': 'error',
      'no-debugger': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-param-reassign': 'error',
      'no-implicit-coercion': 'error',
      'object-shorthand': 'error',
      'no-return-assign': 'error',
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',

      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'indent': ['error', 2, { SwitchCase: 1 }],
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  }
);
