import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/.nx/**', '**/coverage/**', '**/node_modules/**', '**/next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Allow intentionally-unused identifiers when prefixed with `_` (e.g. required-by-signature params).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node-context files outside the TS toolchain: scripts, CJS/MJS configs.
    files: ['scripts/**/*.{js,mjs,cjs}', '**/*.config.{js,cjs,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // CommonJS config files: require() is the correct module form, not a violation.
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
