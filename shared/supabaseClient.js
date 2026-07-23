// Instancia única del cliente Supabase. Las cuatro pantallas importan esto,
// nunca llaman a createClient() por su cuenta — así hay un solo lugar
// que sabe cómo se conecta el sistema a la base.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
