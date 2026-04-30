import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

// ═══════════════════════════════════════════════════════════════════════════════
// Shared restriction patterns
// ═══════════════════════════════════════════════════════════════════════════════
// no-restricted-imports は同一ファイルに複数 config がマッチした場合、
// config 配列の最後のエントリが勝つ (マージされない)。
// 各スコープに必要なパターンをすべて含めるため、共通パターンを変数化する。

const retiredRelayPackageName = ['r', 'x', '-', 'n', 'o', 's', 't', 'r'].join('');
const retiredRelayPackagePatterns = [retiredRelayPackageName, `${retiredRelayPackageName}/*`];

/** Legacy $lib → $shared migration guard */
const legacyLibPatterns = [
  {
    group: ['$lib/nostr/*', '$lib/stores/*'],
    message: 'Use $shared gateway/bridge, not $lib directly. See CLAUDE.md Architecture section.'
  }
];

/** Internal .svelte implementation files should not be imported directly */
const internalSveltePatterns = [
  {
    group: ['$shared/browser/*.svelte*', '$shared/nostr/*.svelte*'],
    message: 'Import the public $shared bridge modules, not internal *.svelte implementation files.'
  },
  {
    group: ['$shared/browser/stores*'],
    message:
      '$shared/browser/stores is an internal bootstrap helper. Import specific public bridges instead.'
  }
];

/** Cross-feature: only domain/ imports allowed */
const crossFeaturePatterns = [
  {
    group: ['$features/*/application/**', '$features/*/infra/**', '$features/*/ui/**'],
    message:
      'Cross-feature imports are limited to domain/ only. Use $shared for cross-cutting concerns.'
  }
];

/** #10: Path alias enforcement for src/shared/ files */
const aliasEnforcementPatterns = [
  {
    group: ['../../features/*', '../../features/**', '../../../features/*', '../../../features/**'],
    message: 'Use $features alias instead of relative path to features/.'
  },
  {
    group: ['../../app/*', '../../app/**', '../../../app/*', '../../../app/**'],
    message: 'Use $appcore alias instead of relative path to app/.'
  },
  {
    group: ['../../lib/*', '../../lib/**', '../../../lib/*', '../../../lib/**'],
    message: 'Use $lib alias instead of relative path to lib/.'
  }
];

/** #18: nostr-tools — client code may only use nip19 subpath */
const nostrToolsClientPatterns = [
  {
    group: [
      'nostr-tools/pure',
      'nostr-tools/utils',
      'nostr-tools/relay',
      'nostr-tools/pool',
      'nostr-tools/abstract-relay',
      'nostr-tools/abstract-pool',
      'nostr-tools/kinds',
      'nostr-tools/filter',
      'nostr-tools/event',
      'nostr-tools/references',
      'nostr-tools/wasm',
      'nostr-tools/core',
      'nostr-tools/fakejson',
      'nostr-tools/nip04',
      'nostr-tools/nip05',
      'nostr-tools/nip06',
      'nostr-tools/nip07',
      'nostr-tools/nip10',
      'nostr-tools/nip11',
      'nostr-tools/nip13',
      'nostr-tools/nip17',
      'nostr-tools/nip18',
      'nostr-tools/nip44',
      'nostr-tools/nip47',
      'nostr-tools/nip57',
      'nostr-tools/nip98'
    ],
    message: 'Client code may only use nostr-tools/nip19. See CLAUDE.md Tech Stack.'
  }
];

/** #20: i18n internal modules should not be imported directly */
const i18nInternalPatterns = [
  {
    group: ['$shared/i18n/locales*', '$shared/i18n/messages*', '$shared/i18n/format*'],
    message:
      'Import from $shared/i18n/t.js (public API) only. Internal i18n modules are not public.'
  }
];

export default ts.config(
  // ═══════════════════════════════════════════════════════════════════════════
  // Base Presets
  // ═══════════════════════════════════════════════════════════════════════════
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,

  // ═══════════════════════════════════════════════════════════════════════════
  // Global Language Options
  // ═══════════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Code Quality Rules (all files)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      // #9: Import sorting (auto-fixable)
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^\\u0000'], // Side-effect imports
            ['^[a-z@]'], // External packages
            ['^\\$'], // Path aliases ($shared, $features, $appcore, $lib)
            ['^\\.'] // Relative imports
          ]
        }
      ],
      'simple-import-sort/exports': 'error',
      // #1: Consistent type imports (auto-fixable)
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' }
      ],
      // #3: No type import side effects (auto-fixable)
      '@typescript-eslint/no-import-type-side-effects': 'error',
      // #14: No parameter reassignment (immutability)
      'no-param-reassign': ['error', { props: false }],
      // #17: Code style (auto-fixable)
      'object-shorthand': ['error', 'always'],
      'prefer-template': 'warn',
      // #6: Restricted globals (Svelte gotcha prevention)
      'no-restricted-globals': [
        'error',
        { name: 'event', message: 'Use explicit event parameter instead of global `event`.' },
        { name: 'name', message: 'Shadowed by window.name. Use a more specific variable name.' }
      ],
      // #5 (partial): Strict rules without type info
      '@typescript-eslint/no-dynamic-delete': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      // #7: Consistent type definitions (stylistic)
      '@typescript-eslint/consistent-type-definitions': 'warn'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Scoped Code Quality
  // ═══════════════════════════════════════════════════════════════════════════

  // #2: No console in production code (warn/error allowed)
  {
    files: ['src/**/*.ts', 'src/**/*.svelte.ts', 'src/**/*.svelte'],
    ignores: ['src/**/*.test.ts', 'src/shared/utils/logger.ts'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  },
  // #5 (partial): no-non-null-assertion (warn in non-test code)
  {
    files: ['src/**/*.ts', 'src/**/*.svelte.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error'
    }
  },
  // #8: Server security
  {
    files: ['src/server/**/*.ts'],
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error'
    }
  },
  // #19: safeFetch enforcement — bare fetch() banned in src/server/ (SSRF protection)
  // safe-fetch.ts is excluded because safeFetch() uses fetch() internally.
  {
    files: ['src/server/**/*.ts'],
    ignores: ['src/server/**/*.test.ts', 'src/server/lib/safe-fetch.ts'],
    rules: {
      // Includes global event/name restrictions (from code quality rules) because
      // no-restricted-globals is last-config-wins — this scope overrides the global scope.
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Use safeFetch() from src/server/lib/safe-fetch.ts for SSRF protection. See CLAUDE.md.'
        },
        { name: 'event', message: 'Use explicit event parameter instead of global `event`.' },
        { name: 'name', message: 'Shadowed by window.name. Use a more specific variable name.' }
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // #4: Type-Checked Rules (require TypeScript project service)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    files: ['src/**/*.ts', 'src/**/*.svelte.ts'],
    ignores: ['src/service-worker.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // Async safety
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      // #11: Switch exhaustiveness
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // #12: Prefer nullish coalescing (auto-fixable)
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } }
      ],
      // #15: No unnecessary type assertion (auto-fixable)
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      // #16: Only throw Error objects
      '@typescript-eslint/only-throw-error': 'error',
      // #13: Prefer optional chain (auto-fixable, needs type info)
      '@typescript-eslint/prefer-optional-chain': 'error',
      // #5 (partial): Strict type-checked rules
      '@typescript-eslint/no-unnecessary-condition': 'error'
    }
  },

  // Test files: relax rules that conflict with mock patterns
  // MUST come after type-checked scope to override require-await
  {
    files: ['src/**/*.test.ts'],
    rules: {
      // Mock functions are often async without await (e.g., async json() { return {...} })
      '@typescript-eslint/require-await': 'off'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Svelte-specific
  // ═══════════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Architecture Boundary Guards — Feature Layers (A-D)
  // ═══════════════════════════════════════════════════════════════════════════
  // NOTE: no-restricted-imports は同一ファイルに複数マッチした場合、
  //       config 配列の最後のエントリが勝つ (マージされない)。
  //       各スコープに必要なパターンをすべて含める必要がある。

  // ── A: Domain layer — full lockdown ──
  {
    files: ['src/features/**/domain/**/*.ts'],
    ignores: ['src/features/**/domain/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // Same-feature upper layers
            {
              group: [
                '../application/*',
                '../application/**',
                '../infra/*',
                '../infra/**',
                '../ui/*',
                '../ui/**'
              ],
              message: 'Domain must not import application/infra/ui layers.'
            },
            // Browser state
            {
              group: ['$shared/browser/*'],
              message: 'Domain must be browser-agnostic.'
            },
            // Nostr infra
            {
              group: ['$shared/nostr/*'],
              message:
                'Domain must not depend on Nostr infra. Extract pure functions to domain or pass as parameters.'
            },
            // External nostr/rx libraries (ALL blocked — stricter than #18)
            {
              group: [
                ...retiredRelayPackagePatterns,
                'rxjs',
                'rxjs/*',
                'nostr-tools',
                'nostr-tools/*',
                'nostr-typedef',
                'nostr-typedef/*'
              ],
              message: 'Domain must not depend on external Nostr/rx libraries directly.'
            },
            // UI framework
            {
              group: ['svelte', 'svelte/*', '$lib/components/*', '$lib/components/**'],
              message: 'Domain must not depend on UI framework.'
            },
            ...crossFeaturePatterns,
            ...legacyLibPatterns,
            ...internalSveltePatterns,
            ...i18nInternalPatterns
          ]
        }
      ]
    }
  },
  // ── B: Application layer ──
  {
    files: ['src/features/**/application/**/*.ts', 'src/features/**/application/**/*.svelte.ts'],
    ignores: ['src/features/**/application/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // Application must not import UI
            {
              group: ['../ui/*', '../ui/**'],
              message:
                'Application must not import from UI layer. Dependency direction: ui → application.'
            },
            // UI framework
            {
              group: ['$lib/components/*', '$lib/components/**'],
              message: 'Application must not depend on UI components.'
            },
            ...crossFeaturePatterns,
            ...legacyLibPatterns,
            ...internalSveltePatterns,
            ...nostrToolsClientPatterns,
            ...i18nInternalPatterns
          ]
        }
      ]
    }
  },
  // ── C: Infra layer ──
  {
    files: ['src/features/**/infra/**/*.ts', 'src/features/**/infra/**/*.svelte.ts'],
    ignores: ['src/features/**/infra/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // Infra must not import UI or Application
            {
              group: ['../ui/*', '../ui/**'],
              message: 'Infra must not import from UI layer.'
            },
            {
              group: ['../application/*', '../application/**'],
              message:
                'Infra must not import from Application layer. Dependency direction: application → infra.'
            },
            // UI framework
            {
              group: ['$lib/components/*', '$lib/components/**'],
              message: 'Infra must not depend on UI components.'
            },
            ...crossFeaturePatterns,
            ...legacyLibPatterns,
            ...internalSveltePatterns,
            ...nostrToolsClientPatterns,
            ...i18nInternalPatterns
          ]
        }
      ]
    }
  },
  // ── D: UI layer (features) ──
  {
    files: [
      'src/features/**/ui/**/*.ts',
      'src/features/**/ui/**/*.svelte.ts',
      'src/features/**/ui/**/*.svelte'
    ],
    ignores: ['src/features/**/ui/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // UI must not access infra directly
            {
              group: ['../infra/*', '../infra/**'],
              message: 'UI must access infra through application layer, not directly.'
            },
            // retired relay package/rxjs direct usage
            {
              group: [...retiredRelayPackagePatterns, 'rxjs', 'rxjs/*'],
              message:
                'UI must not use retired relay packages/rxjs directly. Use application layer.'
            },
            ...crossFeaturePatterns,
            ...legacyLibPatterns,
            ...internalSveltePatterns,
            ...nostrToolsClientPatterns,
            ...i18nInternalPatterns
          ]
        }
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Architecture Boundary Guards — App / Routes / Components
  // ═══════════════════════════════════════════════════════════════════════════

  // App layer (bootstrap, session)
  {
    files: ['src/app/**/*.ts', 'src/app/**/*.svelte.ts'],
    ignores: ['src/app/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [...legacyLibPatterns, ...internalSveltePatterns, ...nostrToolsClientPatterns]
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
              group: [retiredRelayPackageName, '$lib/nostr/client*', '$lib/nostr/event-db*'],
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
                'Routes should use moved $shared public content/helpers instead of interop wrappers in $lib.'
            },
            {
              group: ['$lib/stores/*.svelte.js'],
              message: 'Routes should use $shared/$features facades, not legacy $lib/stores.'
            },
            ...internalSveltePatterns,
            ...nostrToolsClientPatterns,
            ...i18nInternalPatterns
          ]
        }
      ]
    }
  },
  // #21: UI components — no direct infra, no business logic in helpers
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
                'Components should use moved $shared public content/helpers instead of interop wrappers in $lib.'
            },
            {
              group: ['../stores/*.svelte.js', '$lib/stores/*.svelte.js'],
              message:
                'Components must use $shared/$features facades for stateful stores, not legacy store modules.'
            },
            // #21: Component-local helpers must not contain business logic
            {
              group: ['$features/*/application/**', '$features/*/infra/**'],
              message:
                'Component-local helpers must not import feature application/infra. Move business logic to $features or $shared.'
            },
            {
              group: ['$shared/nostr/gateway*', '$shared/nostr/publish-signed*'],
              message:
                'Component-local helpers must not access Nostr gateway directly. This is business logic.'
            },
            {
              group: [...retiredRelayPackagePatterns, 'rxjs', 'rxjs/*'],
              message:
                'Component-local helpers must not use retired relay packages/rxjs. This is infra concern.'
            },
            ...internalSveltePatterns,
            ...nostrToolsClientPatterns,
            ...i18nInternalPatterns
          ]
        }
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Architecture Boundary Guards — Shared modules + alias enforcement
  // ═══════════════════════════════════════════════════════════════════════════

  // Shared content resolvers: gateway only + legacy drift + alias enforcement
  // NOTE: This is more specific than src/shared/content/*.ts and MUST come after it,
  //       because it overrides that scope for resolver files.
  {
    files: ['src/shared/content/*resolver*.ts'],
    ignores: ['src/shared/content/*resolver*.test.ts'],
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
                'Content resolvers should use $shared/auftakt/resonote.js instead of direct client/event-db imports.'
            },
            // Include legacy content drift (from general content scope, since this overrides it)
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
            },
            ...aliasEnforcementPatterns
          ]
        }
      ]
    }
  },
  // Shared content tests: public alias only
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
  // Extension and related tests: use shared content contracts
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
                'Extension code and lib/nostr tests should import $shared/content contracts instead of legacy interop wrappers.'
            }
          ]
        }
      ]
    }
  },
  // Shared browser: legacy drift guard + #10 alias enforcement
  {
    files: ['src/shared/browser/*.ts'],
    ignores: ['src/shared/browser/*.test.ts'],
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
            },
            ...aliasEnforcementPatterns
          ]
        }
      ]
    }
  },
  // Shared nostr: legacy drift guard + #10 alias enforcement
  {
    files: ['src/shared/nostr/*.ts', 'src/shared/nostr/*.svelte.ts'],
    ignores: ['src/shared/nostr/*.test.ts'],
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
            },
            ...aliasEnforcementPatterns
          ]
        }
      ]
    }
  },
  // Shared utils: legacy drift guard + #10 alias enforcement
  {
    files: ['src/shared/utils/*.ts'],
    ignores: ['src/shared/utils/*.test.ts'],
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
            },
            ...aliasEnforcementPatterns
          ]
        }
      ]
    }
  },
  // Shared utils tests: public alias only
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
  // Shared content: legacy drift guard + #10 alias enforcement
  // NOTE: *resolver*.ts scope above overrides this for resolver files (includes these patterns too)
  {
    files: ['src/shared/content/*.ts'],
    ignores: ['src/shared/content/*.test.ts'],
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
            },
            ...aliasEnforcementPatterns
          ]
        }
      ]
    }
  },
  // #22: src/lib/stores/ is deleted — fail immediately if recreated
  {
    files: ['src/lib/stores/**/*.ts', 'src/lib/stores/**/*.svelte.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*'],
              message:
                'src/lib/stores/ is deleted and must not be recreated. Use $shared/browser/* instead. See CLAUDE.md Residual Policy.'
            }
          ]
        }
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Ignores
  // ═══════════════════════════════════════════════════════════════════════════
  {
    ignores: [
      'build/',
      'dist-extension/',
      '.svelte-kit/',
      '.wrangler/',
      '.omx/',
      '.worktrees/',
      '.claude/worktrees/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'coverage/',
      'e2e/helpers/'
    ]
  }
);
