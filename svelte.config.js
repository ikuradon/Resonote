import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    })
  },
  vitePlugin: {
    dynamicCompileOptions: ({ filename }) => ({ runes: !filename.includes('node_modules') })
  }
};

export default config;
