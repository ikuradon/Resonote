import { codecovVitePlugin } from '@codecov/vite-plugin';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { searchForWorkspaceRoot } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    codecovVitePlugin({
      enableBundleAnalysis: !!process.env.CODECOV_TOKEN,
      bundleName: 'resonote',
      uploadToken: process.env.CODECOV_TOKEN
    })
  ],
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())]
    },
    watch: {
      ignored: ['**/.worktrees/**', '**/.claude/worktrees/**']
    }
  },
  build: {
    // Large vendor chunks are lazy-loaded via dynamic import:
    // - @ikuradon/emoji-kitchen-mart-data (~10MB) — emoji dataset
    // - @konemono/nostr-login (~615KB) — Nostr login UI
    // These don't block initial page load.
    chunkSizeWarningLimit: 1000
  },
  test: {
    include: ['src/**/*.test.ts', 'packages/**/*.test.ts'],
    passWithNoTests: true,
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/junit.xml' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'packages/**/*.ts',
        'src/lib/**/*.ts',
        'src/features/**/*.ts',
        'src/app/**/*.ts',
        'src/shared/**/*.ts',
        'src/server/**/*.ts'
      ],
      exclude: [
        'packages/**/*.test.ts',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        // Re-export facades (pure re-exports, no testable logic)
        'src/shared/browser/auth.ts',
        'src/shared/browser/bookmarks.ts',
        'src/shared/browser/click-outside.ts',
        'src/shared/browser/dev-tools.ts',
        'src/shared/browser/emoji-mart.ts',
        'src/shared/browser/emoji-sets.ts',
        'src/shared/browser/extension.ts',
        'src/shared/browser/follows.ts',
        'src/shared/browser/keyboard-shortcuts.ts',
        'src/shared/browser/locale.ts',
        'src/shared/browser/media-query.ts',
        'src/shared/browser/mute.ts',
        'src/shared/browser/notifications.ts',
        'src/shared/browser/player.ts',
        'src/shared/browser/profile.ts',
        'src/shared/browser/relays.ts',
        'src/shared/browser/stores.ts',
        'src/shared/browser/toast.ts',
        'src/shared/content/resolution.ts',
        'src/shared/nostr/cached-query.ts',
        'src/shared/nostr/content-link.ts',
        'src/shared/nostr/gateway.ts',
        'src/shared/nostr/nip19-decode.ts',
        'src/shared/nostr/relays.ts',
        'src/shared/nostr/user-relays.ts',
        // Type-only files (no runtime code)
        'src/features/comments/domain/comment-model.ts',
        'src/features/content-resolution/domain/content-metadata.ts',
        'src/features/notifications/domain/notification-model.ts',
        'src/server/api/bindings.ts',
        // Application-layer re-export facades
        'src/features/content-resolution/application/resolve-podbean-embed.ts',
        'src/features/content-resolution/application/resolve-soundcloud-embed.ts',
        // Svelte rune-dependent files (unit test impractical, E2E で担保)
        'src/features/comments/ui/comment-profile-preload.svelte.ts'
      ]
      // Coverage 対象外の理由:
      // - src/web/ — Svelte コンポーネント (.svelte) が主体、コンポーネントテスト/E2E で担保
      // - src/extension/ — chrome.* API 依存、E2E で担保
      // - src/service-worker.ts — ブラウザ API 依存、E2E で担保
    }
  }
});
