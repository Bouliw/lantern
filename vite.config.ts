import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

/**
 * TV packages load from file://, where ES modules and crossorigin requests are not reliable.
 * In "tv" mode the app is emitted as one classic script.
 */
function classicScripts(): Plugin {
  return {
    name: 'lantern-classic-scripts',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html
          .replace(/<script type="module" crossorigin/g, '<script defer')
          .replace(/<link rel="modulepreload"[^>]*>/g, '')
          .replace(/ crossorigin/g, ''),
    },
  };
}

// Relative base so the same build works from a web server, a webOS package and an installed web app.
export default defineConfig(({ mode }) => {
  const tv = mode === 'tv';
  return {
    base: './',
    plugins: [preact(), ...(tv ? [classicScripts()] : [])],
    build: {
      target: ['es2020', 'safari15', 'chrome87'],
      outDir: tv ? 'dist-tv' : 'dist',
      assetsInlineLimit: 0,
      sourcemap: false,
      modulePreload: !tv,
      cssCodeSplit: !tv,
      // hls.js is loaded on demand, only by browsers without native HLS.
      chunkSizeWarningLimit: tv ? 1200 : 700,
      rollupOptions: tv ? { output: { format: 'iife', inlineDynamicImports: true } } : {},
    },
    server: { host: true, port: 5173 },
  };
});
