import prettier from '@vue/eslint-config-prettier'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

const config: ReturnType<typeof defineConfigWithVueTs> = defineConfigWithVueTs(
  {
    name: 'qarr/files',
    files: ['**/*.ts', '**/*.vue'],
  },
  {
    name: 'qarr/ignores',
    ignores: ['dist/**', 'node_modules/**'],
  },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommendedTypeChecked,
  prettier,
  {
    name: 'qarr/rules',
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    name: 'qarr/tests',
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      'vue/one-component-per-file': 'off',
    },
  },
)

export default config
