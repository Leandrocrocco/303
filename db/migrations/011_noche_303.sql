-- Regla de "noche de negocio": a qué turno pertenece un evento externo fechado
-- por timestamp (venta de barra en Revolut, ticket online de RA).
-- Correr entero en Supabase SQL Editor. No toca tablas ni RLS: solo agrega una
-- función inmutable. Los taps de puerta NO dependen de esto (ya van atados al
-- turno activo); esto es SOLO para cruzar data externa por hora.
--
-- Regla de negocio: jueves = hasta 04:00 del viernes, viernes = hasta 04:00
-- del sábado, sábado = hasta 04:00 del domingo. Se implementa con un corte a las
-- 06:00 (margen sobre el cierre de 04:00; los doors abren ~23:00, así que nunca
-- hay ventas entre 06:00 y la apertura → el margen no captura la noche siguiente).
--
-- CLAVE: convertir a hora local de Barcelona ANTES de restar y castear a date.
-- Sin el `at time zone`, un timestamptz guardado en UTC corre la fecha en la
-- madrugada (mismo bug que ya se arregló en la app de puerta).

create or replace function noche_303(ts timestamptz)
returns date
language sql
immutable
as $$
  select ((ts at time zone 'Europe/Madrid') - interval '6 hours')::date
$$;

-- Uso al importar Revolut/RA: cruzar cada fila externa con su turno por fecha.
--   select r.*, t.id_turno
--   from revolut_import r
--   join turnos t
--     on t.id_cliente = r.id_cliente
--    and t.fecha = noche_303(r.timestamp);
--
-- Verificación rápida (debería devolver el jueves para una venta del vie 03:30):
--   select noche_303('2026-07-18 03:30:00+02'::timestamptz);  -- -> 2026-07-17
--   select noche_303('2026-07-18 23:15:00+02'::timestamptz);  -- -> 2026-07-18
