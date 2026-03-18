import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        SpotifyIFrameAPI: 'readonly',
        SpotifyEmbedController: 'readonly',
        SpotifyEmbedOptions: 'readonly',
        SpotifyPlaybackState: 'readonly',
        YT: 'readonly'
      }
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    },
    rules: {
      // $state() variables need let for reactivity; not a real const violation
      'prefer-const': 'off',
      // SPA internal links don't need resolve(); goto() paths are static
      'svelte/no-navigation-without-resolve': 'off',
      // Non-reactive Set/Map used intentionally (pending cache, manual reactivity trigger)
      'svelte/prefer-svelte-reactivity': 'off'
    }
  },
  {
    ignores: [
      'build/',
      'dist-extension/',
      '.svelte-kit/',
      '.wrangler/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'coverage/',
      'e2e/helpers/'
    ]
  }
);
