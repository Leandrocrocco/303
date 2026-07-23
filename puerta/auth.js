// Login del dispositivo de puerta. Se hace una sola vez por teléfono:
// persistSession (configurado en shared/supabaseClient.js) mantiene la
// sesión activa entre cierres de la app, así que esto normalmente no
// vuelve a pedirse.

import { supabase } from '../shared/supabaseClient.js';

export async function haySesion() {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

export async function iniciarSesion(email, contrasena) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: contrasena });
  if (error) throw error;
}
