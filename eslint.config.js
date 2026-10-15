import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import hooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'release/**', '.test-artifacts/**', 'src/components/ui/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: hooks.configs.recommended.rules,
  },
)
