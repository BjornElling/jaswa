import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const eslintConfig = defineConfig([
  globalIgnores(['dist/**', '.wrangler/**', 'helper/**', 'public/**', 'scripts/**', 'work/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['app/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='select']",
          message: 'Use the shared Dropdown component instead of a raw select.',
        },
      ],
    },
  },
  {
    files: ['app/components/dropdown.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['app/ingest/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-dom', '**/platform/**', '**/workspace/**', '**/components/**', '**/features/**', '**/shell/**'],
          message: 'Ingestion decodes data without UI, workspace or platform dependencies.',
        }],
      }],
    },
  },
  {
    files: ['app/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        { selector: "JSXOpeningElement[name.name='select']", message: 'Use the shared Dropdown component instead of a raw select.' },
        { selector: "NewExpression[callee.name='Worker']", message: 'Create workers at the platform boundary.' },
      ],
    },
  },
  {
    files: ['app/components/dropdown.tsx'],
    rules: { 'no-restricted-syntax': ['error', {
      selector: "NewExpression[callee.name='Worker']",
      message: 'Create workers at the platform boundary.',
    }] },
  },
  {
    files: ['app/lib/compute/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', {
      selector: "NewExpression[callee.name='Worker']",
      message: 'Create workers at the platform boundary.',
    }] },
  },
]);

export default eslintConfig;
