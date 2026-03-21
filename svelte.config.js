import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    }),
    alias: {
      $shared: 'src/shared',
      $features: 'src/features',
      $appcore: 'src/app',
      $extension: 'src/extension'
    },
    files: {
      routes: 'src/web/routes',
      appTemplate: 'src/web/app.html'
    }
  },
  vitePlugin: {
    dynamicCompileOptions: ({ filename }) => ({ runes: !filename.includes('node_modules') })
  }
};

export default config;
