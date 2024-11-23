// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// Default ESLint and TypeScript ESLint configs
export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Relax some strict rules to make it less strict
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': ['warn'], // Warn about unused vars instead of error
      'no-console': 'warn', // Allow console logs, just give a warning
      'no-debugger': 'warn', // Allow debugger, just give a warning
      '@typescript-eslint/no-explicit-any': 'off',
      'eqeqeq': 'off', // Allow loose equality comparisons (== instead of ===)
      'curly': 'off', // Allow omitting curly braces for single-line blocks
      'semi': ['warn', 'always'], // Warn about missing semicolons
      'quotes': ['warn', 'single'], // Warn about using single quotes (can also allow double)
      'indent': ['warn', 2], // Warn if indentation is not 2 spaces
      'prefer-const': 'warn', // Warn if a variable is not `const` when possible
      '@typescript-eslint/no-require-imports': 'off',
    },
    languageOptions: {
      globals: {
        node: true,
        jest: true,
        module: true,
        process: true,
        setTimeout: true,
        clearTimeout: true,
        global: true,
        __dirname: true,
        require: true,
        exports: true,
        describe: true,
        it: true,
        expect: true,
        test: true,
        console: true,
        beforeEach: true,
        afterEach: true,
        beforeAll: true,
        afterAll: true
      }
    }
  }
);
