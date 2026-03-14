import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    }),
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
