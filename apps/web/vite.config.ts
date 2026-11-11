import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '../../');
  const targetMode = process.env.APP_ENV || mode;
  const env = loadEnv(targetMode, envDir, '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@smartfa/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts')
      }
    },
    envDir,
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
        (process.env.VITE_API_BASE_URL && !process.env.VITE_API_BASE_URL.includes('localhost'))
          ? process.env.VITE_API_BASE_URL
          : (env.VITE_API_BASE_URL && !env.VITE_API_BASE_URL.includes('localhost'))
            ? env.VITE_API_BASE_URL
            : (mode === 'production' || targetMode === 'production' || process.env.NODE_ENV === 'production')
              ? 'https://acadassess-api.onrender.com/api/v1'
              : (process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1')
      ),
      ...(process.env.APP_ENV ? {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY),
      } : {})
    },
    server: {
      port: 3000,
      host: true,
      fs: {
        allow: [
          path.resolve(__dirname, '../../'),
          path.resolve(__dirname, '../'),
          path.resolve(__dirname, '.'),
          path.resolve(process.cwd(), '..'),
          path.resolve(process.cwd())
        ]
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-icons': ['lucide-react'],
            'vendor-pdf': ['pdfjs-dist']
          }
        }
      },
      chunkSizeWarningLimit: 600
    }
  };
});

