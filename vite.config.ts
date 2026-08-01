import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Tauri injects these when running `tauri dev` / `tauri build`.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },

  // Tauri expects a fixed port and fails if it is not available.
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      // Rust sources are rebuilt by cargo, not Vite.
      ignored: ['**/src-tauri/**'],
    },
  },

  // Produce output that matches the minimum webview versions Tauri supports.
  build: {
    target: 'es2022',
    // Minification is left at Vite 8's default (Rolldown's built-in minifier);
    // naming `esbuild` here would pull in a dependency Vite no longer ships.
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        // Keep the heavyweight vendors in their own chunks so the app shell
        // paints before Monaco and PDF.js are needed. Vite 8 bundles with
        // Rolldown, whose `advancedChunks` replaces Rollup's `manualChunks`.
        advancedChunks: {
          groups: [
            { name: 'monaco', test: /[\\/]node_modules[\\/]monaco-editor[\\/]/ },
            { name: 'pdfjs', test: /[\\/]node_modules[\\/]pdfjs-dist[\\/]/ },
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },

  // Monaco and PDF.js are large; pre-bundling them keeps dev server reloads fast.
  optimizeDeps: {
    include: ['monaco-editor', 'pdfjs-dist'],
  },

  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
});
