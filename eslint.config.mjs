import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/* The layers of `docs/ARCHITECTURE-FROM-SCRATCH.md` §§21.5 and 22.3, stated here
   so a wrong import fails in the editor. `scripts/verify-import-graph.mjs` holds
   the same direction over the whole graph, cycles included. */
const layer = (...names) => names.map((name) => `**/${name}/**`);
const restrictImports = (patterns, message) => ['error', { patterns: [{ group: patterns, message }] }];
const noSelect = { selector: "JSXOpeningElement[name.name='select']", message: 'Use the shared Dropdown component instead of a raw select.' };
const noWorker = { selector: "NewExpression[callee.name='Worker']", message: 'Create workers at the platform boundary (app/platform/feature-workers.ts).' };
const browserGlobals = ['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'fetch']
  .map((name) => ({ name, message: 'The domain and ingestion layers run without a browser; reach it through app/platform.' }));

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
      'no-restricted-syntax': ['error', noSelect, noWorker],
    },
  },
  {
    files: ['app/ui/dropdown.tsx'],
    rules: { 'no-restricted-syntax': ['error', noWorker] },
  },
  {
    files: ['app/platform/feature-workers.ts', 'app/platform/rune-simulator-factory.ts'],
    rules: { 'no-restricted-syntax': ['error', noSelect] },
  },
  {
    files: ['app/domain/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrictImports(['react', 'react-dom', ...layer('platform', 'workspace', 'features', 'shell', 'ui', 'ingest')],
        'The domain is pure: it imports only the domain and reference data.'),
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    files: ['app/ingest/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrictImports(['react', 'react-dom', ...layer('platform', 'workspace', 'features', 'shell', 'ui')],
        'Ingestion decodes data without UI, workspace or platform dependencies.'),
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    files: ['app/workspace/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrictImports(layer('platform', 'features', 'shell', 'ui'),
        'The workspace declares ports; only the shell connects them to the platform.'),
    },
  },
  {
    files: ['app/platform/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrictImports(layer('features', 'shell', 'ui'),
        'The platform implements ports; it never reaches up into the interface.'),
    },
  },
  {
    files: ['app/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictImports(layer('platform', 'workspace', 'features', 'shell', 'ingest'),
        'Shared UI uses domain values and formatters only, never storage or workflows.'),
    },
  },
  {
    files: ['app/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictImports(layer('shell', 'ingest'),
        'A feature reads workspace queries and dispatches commands; another feature only through its public.ts.'),
    },
  },
]);

export default eslintConfig;
