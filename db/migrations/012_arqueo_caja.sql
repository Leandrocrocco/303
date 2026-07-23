-- Arqueo de caja al cierre de turno → varianza "¿me están robando?".
-- Correr entero en Supabase SQL Editor. Columnas nullable/default → no rompe RLS
-- ni datos existentes (las noches viejas quedan con efectivo_contado NULL = sin arqueo).
--
-- fondo_caja       = con cuánto efectivo arranca la caja (Box Start, def €250).
-- efectivo_contado = efectivo físico contado al cerrar (NULL = no se cargó).
-- Varianza (se calcula en el dashboard, no se guarda): (contado − fondo) − esperado,
-- donde esperado = tickets no-RA × valor + guardarropa (lo que la caja debería tener).

alter table turnos add column if not exists fondo_caja numeric not null default 250;
alter table turnos add column if not exists efectivo_contado numeric;
