import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Caminhos que o lint nunca deve tocar
  { ignores: ['dist/', 'coverage/', '.serverless/'] },

  // Regras com checagem de tipos aplicadas só ao nosso código TS (src + tests)
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Exigência do CLAUDE.md / DEVELOPMENT_GUIDE
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Desliga regras que conflitam com o Prettier (precisa ser o último)
  prettier,
);
