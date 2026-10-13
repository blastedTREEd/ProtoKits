import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

const APP_MODES = {
  snorlaxgarage: 'snorlaxgarage',
  liquikits: 'liquikits',
  protokits: 'protokits',
  komiprints: 'komiprints',
  garagecore: 'garagecore',
  daivevargas: 'daivevargas'
};
const DEFAULT_APP_ID = 'liquikits';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appId = env.VITE_APP_ID || APP_MODES[mode] || DEFAULT_APP_ID;

  return {
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],

  server: {
    host: true,
    // Vercel Dev provides PORT; plain Vite development keeps the familiar 5173 port.
    port: Number(process.env.PORT) || 5173,
  },
  define: {
    // Custom Vite modes make every product locally testable without editing
    // the shared source or copying the application into four forks.
    'import.meta.env.VITE_APP_ID': JSON.stringify(appId)
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) {
            return 'firebase';
          }
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-framer';
          }
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) {
            return 'vendor-leaflet';
          }
        },
      },
    },
  },
  };
})
