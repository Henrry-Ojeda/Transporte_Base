import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5188',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: process.env.BUILD_DEST === 'wwwroot' 
      ? path.resolve(import.meta.dirname, '../Backend/src/Transporte.API/wwwroot')
      : 'dist',
    emptyOutDir: true,
    sourcemap: false,
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('@tanstack') || id.includes('zustand')) {
              return 'vendor-query';
            }
            if (id.includes('lucide-react') || id.includes('sonner') || id.includes('@radix-ui')) {
              return 'vendor-ui';
            }
            if (id.includes('xlsx')) {
              return 'vendor-excel';
            }
          }
        },
      },
    },
  },
});
