import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', '.vite', 'public', 'supabase/legacy']),

  /* ---------------------------------------------------------------- Frontend */
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      /*
       * react-hooks 7 signale tout setState appelé depuis un effet. La règle
       * viserait à décourager les cascades de rendu, mais elle se déclenche
       * aussi sur le chargement de données au montage — exactement ce que font
       * les onglets d'administration, qui doivent lire Supabase à l'ouverture.
       * On la désactive plutôt que de contourner le lint fichier par fichier.
       */
      'react-hooks/set-state-in-effect': 'off',
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
      }],
    },
  },

  /* -------------------------------------------------- Serveur Express (CJS) */
  {
    files: ['server/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
      ecmaVersion: 2023,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^(_|next$|req$|res$)', caughtErrors: 'none' }],
      // Les expressions régulières de nettoyage ciblent volontairement des
      // caractères de contrôle présents dans le texte extrait des fichiers.
      'no-control-regex': 'off',
    },
  },

  /* --------------------------------------------------- Scripts Node (ESM) -- */
  {
    files: ['scripts/**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
      ecmaVersion: 2023,
    },
  },

  /* ------------------------------------------- Configuration du projet ----- */
  {
    files: ['*.config.js', 'vite.config.js', 'create-super-admin.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
])
