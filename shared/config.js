// Claves públicas de Supabase. Es seguro que este archivo sea visible en el navegador:
// el anon/publishable key está limitado por las policies de RLS en la base, no por secreto.
// Si en algún momento cambia de proyecto Supabase (o de proveedor), solo se toca este archivo.

export const SUPABASE_URL = 'https://wxmftcelaoonxzxsgjky.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_DJTWtYT6IIh4YLwa_N8yag_-l4k8HmO';

// Sello de versión visible en cada app. Se sube a mano en cada deploy que cambie
// comportamiento: si un teléfono muestra una versión vieja, se sabe que quedó con
// caché del navegador (útil mientras no haya service worker con "red primero").
export const APP_VERSION = 'v2026.07.13d';
