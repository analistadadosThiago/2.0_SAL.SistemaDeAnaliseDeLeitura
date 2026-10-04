import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mzguwfuncsmgihzmeqoq.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_7ikVHkk3N6N7uv2-cmSsTg_VMgP9IMO';

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn('VITE_SUPABASE_URL não encontrada no ambiente. Usando fallback.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
