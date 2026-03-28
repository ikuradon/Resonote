import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    alias: {
      $shared: 'src/shared',
      $features: 'src/features',
      $appcore: 'src/app',
      $extension: 'src/extension',
      $server: 'src/server'
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
