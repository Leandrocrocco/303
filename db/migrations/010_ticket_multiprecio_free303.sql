-- Multi-precio de ticket + botón "FREE 303" (free en el momento, con tag de organizador).
-- Correr entero en Supabase SQL Editor. No rompe RLS existente (columnas nullable/default).

alter table turnos add column if not exists precios_extra numeric[] not null default '{}';

alter table ingresos add column if not exists id_organizador uuid references organizadores(id_organizador);
