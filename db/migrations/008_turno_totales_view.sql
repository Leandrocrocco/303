-- Bug real encontrado armando el dashboard: tanto admin/ como dashboard/
-- traían CADA fila de `ingresos` al navegador para sumarlas ahí. Supabase
-- corta las consultas REST en 1000 filas por default — con ~2000 ingresos
-- ya generados, algunos turnos quedaban con personas/revenue en cero de
-- forma silenciosa, sin ningún error visible.
--
-- La agregación pasa a vivir DENTRO de Postgres: esta vista devuelve una
-- fila por turno (nunca una por tap), así que el límite de 1000 deja de
-- importar sin importar cuántos miles de ingresos acumule el venue.
-- security_invoker=true es obligatorio acá: sin esto, como la vista la crea
-- un rol con BYPASSRLS (postgres, vía SQL Editor), cualquiera que la consulte
-- vería los ingresos de TODOS los clientes, saltando RLS por completo.
-- Con security_invoker=true, la vista respeta los permisos de quien consulta.

create or replace view turno_totales
with (security_invoker = true)
as
select
  id_turno,
  count(*) filter (where tipo <> 'guardarropa')                        as personas,
  coalesce(sum(valor) filter (where tipo <> 'guardarropa'), 0)          as door_revenue,
  coalesce(sum(valor) filter (where tipo <> 'guardarropa' and es_ra), 0)     as ra_revenue,
  coalesce(sum(valor) filter (where tipo <> 'guardarropa' and not es_ra), 0) as cash_revenue,
  count(*) filter (where tipo <> 'guardarropa' and es_ra)               as ra_personas,
  count(*) filter (where tipo <> 'guardarropa' and not es_ra
                    and tipo = 'ticket')                                as cash_personas,
  count(*) filter (where tipo <> 'guardarropa' and not es_ra
                    and tipo in ('free_23h','free_lista'))              as free_personas,
  count(*) filter (where tipo = 'guardarropa')                          as guardarropa_count,
  coalesce(sum(valor) filter (where tipo = 'guardarropa'), 0)           as guardarropa_revenue
from ingresos
group by id_turno;

grant select on turno_totales to anon, authenticated;

-- Mismo motivo, para el conteo de nombres cargados por turno en la Agenda del admin.
create or replace view lista_conteo
with (security_invoker = true)
as
select id_turno, count(*) as nombres
from lista
group by id_turno;

grant select on lista_conteo to anon, authenticated;
