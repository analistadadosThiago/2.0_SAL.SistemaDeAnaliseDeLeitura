import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  const sanitizeUrl = (url?: string) => {
    const defaultUrl = 'https://zeipsxfnmkhrcqkxvddk.supabase.co';
    if (!url) return defaultUrl;
    let clean = url.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    if (clean.includes('giruouwvitrceivuxniu') || !clean.startsWith('http')) {
      return defaultUrl;
    }
    return clean || defaultUrl;
  };

  const sanitizeKey = (key?: string) => {
    const defaultKey = 'sb_publishable_6aZTdeKjeASNqrJswJu9XQ_FD98xZpJ';
    if (!key || key.includes('undefined') || key === 'sb_publishable_7ikVHkk3N6N7uv2-cmSsTg_VMgP9IMO' || key === 'MY_SUPABASE_KEY') return defaultKey;
    return key.trim();
  };

  const supabaseUrl = sanitizeUrl(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = sanitizeKey(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseKey),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabaseKey),
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
