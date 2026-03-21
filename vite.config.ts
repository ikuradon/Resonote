import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { codecovVitePlugin } from '@codecov/vite-plugin';
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
    include: ['src/**/*.test.ts', 'functions/**/*.test.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/junit.xml' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts', 'src/features/**/*.ts', 'src/app/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts']
    }
  }
});
