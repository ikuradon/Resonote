import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
