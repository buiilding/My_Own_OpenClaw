import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // Electron packaged builds load dist/index.html via file://.
  // Relative asset paths prevent blank renderer windows in production.
  base: './',
  plugins: [react()],
  build: {
    // Optimize for faster startup
    minify: 'esbuild', // Faster than terser
    target: 'esnext', // Use modern JS for smaller bundles
    rollupOptions: {
      output: {
        // Manual chunking for better caching and parallel loading
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'zustand': ['zustand'],
        },
      },
    },
    // Increase chunk size warning limit (default is 500kb)
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    // Pre-bundle dependencies for faster dev server startup
    include: ['react', 'react-dom', 'zustand'],
  },
});
