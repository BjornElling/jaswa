import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', '.next-verify/**', 'out/**', 'build/**', 'client/**', 'helper/**', 'next-env.d.ts']),
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
]);

export default eslintConfig;
