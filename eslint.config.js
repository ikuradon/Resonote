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
  // Domain layer: no infra at all
  {
    files: ['src/features/**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['$lib/nostr/client*', '$lib/nostr/event-db*', 'rx-nostr', 'rxjs'],
              message: 'Domain layer must not import infra (rx-nostr, IndexedDB, etc.).'
            }
          ]
        }
      ]
    }
  },
  // Feature layer: no $lib/nostr/* or $lib/stores/* (use $shared gateway/bridge)
  {
    files: [
      'src/features/**/*.ts',
      'src/features/**/*.svelte.ts',
      'src/app/**/*.ts',
      'src/app/**/*.svelte.ts'
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['$lib/nostr/*', '$lib/stores/*'],
              message:
                'Features and app must use $shared gateway/bridge, not $lib directly. See CLAUDE.md Architecture section.'
            }
          ]
        }
      ]
    }
  },
  // Shared content resolvers: reach Nostr infra only through the shared gateway
  {
    files: ['src/shared/content/*resolver*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '$shared/nostr/client*',
                '$shared/nostr/event-db*',
                '$lib/nostr/client*',
                '$lib/nostr/event-db*',
                '../nostr/client*',
                '../nostr/event-db*'
              ],
              message:
                'Content resolvers should use $shared/nostr/gateway.js instead of direct client/event-db imports.'
            }
          ]
        }
      ]
    }
  },
  // Shared content tests should verify the public owner modules, not local relative paths
  {
    files: ['src/shared/content/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*.js'],
              message:
                'Content tests should import $shared/content owner modules via the public alias, not local relative paths.'
            }
          ]
        }
      ]
    }
  },
  // Extension and related tests: use shared content contracts, not compat wrappers
  {
    files: ['src/extension/**/*.ts', 'src/lib/nostr/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '$lib/content/*.js',
                '../content/*.js',
                '../../lib/content/*.js',
                '../lib/content/*.js'
              ],
              message:
                'Extension code and lib/nostr tests should import $shared/content contracts instead of legacy compat wrappers.'
            }
          ]
        }
      ]
    }
  },
  // Public shared bridges: consumers should not import internal *.svelte impls or bootstrap-only helpers
  {
    files: [
      'src/features/**/*.ts',
      'src/features/**/*.svelte.ts',
      'src/web/routes/**/*.svelte',
      'src/lib/components/**/*.svelte',
      'src/lib/components/**/*.svelte.ts'
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['$shared/browser/*.svelte*', '$shared/nostr/*.svelte*'],
              message:
                'Import the public $shared bridge modules, not internal *.svelte implementation files.'
            },
            {
              group: ['$shared/browser/stores*'],
              message:
                '$shared/browser/stores is an internal bootstrap helper. Import specific public bridges instead.'
            }
          ]
        }
      ]
    }
  },
  // Route/layout: no direct infra access
  {
    files: ['src/web/routes/**/*.svelte'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['rx-nostr', '$lib/nostr/client*', '$lib/nostr/event-db*'],
              message:
                'Routes should use feature facades, not infra directly. See CLAUDE.md Architecture section.'
            },
            {
              group: ['$lib/nostr/publish-signed*'],
              message: 'Routes should not publish directly. Use feature actions.'
            },
            {
              group: [
                '$lib/utils/logger.js',
                '$lib/utils/format.js',
                '$lib/utils/emoji.js',
                '$lib/utils/url.js',
                '$lib/content/*.js'
              ],
              message:
                'Routes should use moved $shared public content/helpers instead of compat wrappers in $lib.'
            },
            {
              group: ['$lib/stores/*.svelte.js'],
              message: 'Routes should use $shared/$features facades, not legacy $lib/stores.'
            }
          ]
        }
      ]
    }
  },
  // UI components: no direct infra access
  {
    files: ['src/lib/components/**/*.svelte', 'src/lib/components/**/*.svelte.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '$lib/nostr/client*',
                '$lib/nostr/event-db*',
                '../nostr/client*',
                '../nostr/event-db*',
                '../../nostr/client*',
                '../../nostr/event-db*'
              ],
              message:
                'UI components should use application layer, not infra directly. See CLAUDE.md Architecture section.'
            },
            {
              group: [
                '../utils/logger.js',
                '../utils/format.js',
                '../utils/emoji.js',
                '../utils/url.js',
                '../utils/media-query.svelte.js',
                '$lib/utils/logger.js',
                '$lib/utils/format.js',
                '$lib/utils/emoji.js',
                '$lib/utils/url.js',
                '$lib/utils/media-query.svelte.js',
                '../content/*.js',
                '$lib/content/*.js'
              ],
              message:
                'Components should use moved $shared public content/helpers instead of compat wrappers in $lib.'
            },
            {
              group: ['../stores/*.svelte.js', '$lib/stores/*.svelte.js'],
              message:
                'Components must use $shared/$features facades for stateful stores, not legacy store modules.'
            }
          ]
        }
      ]
    }
  },
  // Shared browser public bridges: moved owners must not drift back to legacy lib stores
  {
    files: ['src/shared/browser/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../../lib/stores/auth.svelte*',
                '../../lib/stores/follows.svelte*',
                '../../lib/stores/bookmarks.svelte*',
                '../../lib/stores/mute.svelte*',
                '../../lib/stores/emoji-sets.svelte*',
                '../../lib/stores/locale.svelte*',
                '../../lib/stores/toast.svelte*',
                '../../lib/stores/dev-tools.svelte*',
                '../../lib/stores/emoji-mart-preload.svelte*',
                '../../lib/stores/profile.svelte*',
                '../../lib/stores/relays.svelte*',
                '../../lib/stores/player.svelte*',
                '../../lib/stores/extension.svelte*'
              ],
              message:
                'Moved owners must live in $shared/browser/*.svelte.ts, not re-export from legacy $lib/stores.'
            }
          ]
        }
      ]
    }
  },
  // Shared nostr public helpers: moved helpers must not drift back to legacy lib/nostr
  {
    files: ['src/shared/nostr/*.ts', 'src/shared/nostr/*.svelte.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../../lib/nostr/events.js',
                '../../lib/nostr/nip19-decode.js',
                '../../lib/nostr/content-link.js',
                '../../lib/nostr/relays.js',
                '../../lib/nostr/nip05.js',
                '../../lib/nostr/cached-nostr.svelte.js',
                '../../lib/nostr/user-relays.js',
                '../../lib/nostr/client.js',
                '../../lib/nostr/publish-signed.js',
                '../../lib/nostr/event-db.js',
                '../../lib/nostr/pending-publishes.js'
              ],
              message:
                'Moved pure/shared helpers must live in $shared/nostr, not re-export from legacy $lib/nostr.'
            }
          ]
        }
      ]
    }
  },
  // Shared utils: moved helpers must not drift back to legacy lib/utils
  {
    files: ['src/shared/utils/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../../lib/utils/logger.js',
                '../../lib/utils/format.js',
                '../../lib/utils/emoji.js',
                '../../lib/utils/url.js'
              ],
              message:
                'Moved shared utils must live in $shared/utils, not re-export from legacy $lib/utils.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/shared/utils/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*.js'],
              message:
                'Shared util tests should import $shared/utils owner modules via the public alias, not local relative paths.'
            }
          ]
        }
      ]
    }
  },
  // Shared content owners: moved core helpers must not drift back to legacy lib/content
  {
    files: ['src/shared/content/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../../lib/content/types.js',
                '../../lib/content/url-utils.js',
                '../../lib/content/registry.js',
                '../../lib/content/spotify.js',
                '../../lib/content/youtube.js',
                '../../lib/content/vimeo.js',
                '../../lib/content/netflix.js',
                '../../lib/content/prime-video.js',
                '../../lib/content/disney-plus.js',
                '../../lib/content/apple-music.js',
                '../../lib/content/soundcloud.js',
                '../../lib/content/fountain-fm.js',
                '../../lib/content/abema.js',
                '../../lib/content/tver.js',
                '../../lib/content/u-next.js',
                '../../lib/content/mixcloud.js',
                '../../lib/content/spreaker.js',
                '../../lib/content/niconico.js',
                '../../lib/content/podbean.js',
                '../../lib/content/audio.js',
                '../../lib/content/podcast.js',
                '../../lib/content/podcast-resolver.js',
                '../../lib/content/episode-resolver.js'
              ],
              message:
                'Moved shared content core must live in $shared/content, not re-export from legacy $lib/content.'
            }
          ]
        }
      ]
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
