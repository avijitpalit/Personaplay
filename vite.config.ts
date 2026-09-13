import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    // base: '/Personaplay/',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.CUSTOM_GEMINI_API_KEY || ''),
      'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY || ''),
      'process.env.XAI_API_KEY': JSON.stringify(env.XAI_API_KEY || ''),
      'process.env.RUNPOD_API_KEY': JSON.stringify(env.RUNPOD_API_KEY || ''),
      'process.env.RUNPOD_ENDPOINT_ID': JSON.stringify(env.RUNPOD_ENDPOINT_ID || ''),
      'import.meta.env.RUNPOD_API_KEY': JSON.stringify(env.RUNPOD_API_KEY || ''),
      'import.meta.env.RUNPOD_ENDPOINT_ID': JSON.stringify(env.RUNPOD_ENDPOINT_ID || ''),
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
