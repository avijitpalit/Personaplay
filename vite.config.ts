import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

function cleanKey(val: string | undefined): string {
  if (!val) return '';
  let k = val.trim();
  if (k.includes('=')) {
    k = k.split('=').slice(1).join('=').trim();
  }
  return k.replace(/^['"]|['"]$/g, '').trim();
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    // base: '/Personaplay/',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.OPENROUTER_API_KEY': JSON.stringify(cleanKey(env.OPENROUTER_API_KEY || '')),
      'process.env.XAI_API_KEY': JSON.stringify(cleanKey(env.XAI_API_KEY || '')),
      'process.env.RUNPOD_API_KEY': JSON.stringify(cleanKey(env.RUNPOD_API_KEY || '')),
      'process.env.RUNPOD_ENDPOINT_ID': JSON.stringify(cleanKey(env.RUNPOD_ENDPOINT_ID || '')),
      'import.meta.env.RUNPOD_API_KEY': JSON.stringify(cleanKey(env.RUNPOD_API_KEY || '')),
      'import.meta.env.RUNPOD_ENDPOINT_ID': JSON.stringify(cleanKey(env.RUNPOD_ENDPOINT_ID || '')),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
