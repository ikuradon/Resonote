import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      $shared: resolve(__dirname, 'src/shared'),
      $features: resolve(__dirname, 'src/features'),
      $appcore: resolve(__dirname, 'src/app'),
      $extension: resolve(__dirname, 'src/extension'),
      $lib: resolve(__dirname, 'src/lib')
    }
  },
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/extension/background.ts'),
        'content-scripts/index': resolve(__dirname, 'src/extension/content-scripts/index.ts'),
        'content-scripts/resonote-bridge': resolve(
          __dirname,
          'src/extension/content-scripts/resonote-bridge.ts'
        ),
        'sidepanel/bridge': resolve(__dirname, 'src/extension/sidepanel/bridge.ts')
      },
      output: {
        entryFileNames: '[name].js',
        format: 'es'
      }
    }
  }
});
