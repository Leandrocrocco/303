-- 303 · Schema inicial
-- Aplicar en Supabase: Project > SQL Editor > pegar y correr entero.

create extension if not exists pgcrypto;
create extension if not exists unaccent;

-- unaccent() no esta marcada immutable por defecto, lo cual bloquea usarla
-- en una columna generada. Este wrapper la fija a un diccionario fijo.
create or replace function immutable_unaccent(text)
returns text
language sql
immutable
as $$
  select unaccent('unaccent', $1);
$$;

-- ============================================================
-- TABLAS
-- ============================================================

create table clientes (
  id_cliente uuid primary key default gen_random_uuid(),
  nombre text not null
);

-- organizadores precargados: alimentan el desplegable del formulario de lista.
-- El PIN es solo atribucion (quien cargo cada nombre), no un limite de seguridad.
create table organizadores (
  id_organizador uuid primary key default gen_random_uuid(),
  id_cliente uuid not null references clientes(id_cliente),
  nombre text not null,
  pin text not null,
  activo boolean not null default true
);

-- productoras precargadas: el portero elige de una lista al abrir turno,
-- nunca texto libre, para que el nombre nunca se fragmente por typo.
create table productoras (
  id_productora uuid primary key default gen_random_uuid(),
  id_cliente uuid not null references clientes(id_cliente),
  nombre text not null,
  activo boolean not null default true,
  -- % de puerta/barra que el venue le paga a la productora (no un acuerdo
  -- fijo global: puede variar de productora a productora). Default 20/30
  -- porque es la regla real que ya usaban a mano en Excel.
  pct_puerta numeric not null default 20,
  pct_barra numeric not null default 30
);

create table turnos (
  id_turno uuid primary key default gen_random_uuid(),
  id_cliente uuid not null references clientes(id_cliente),
  fecha date not null,
  id_productora uuid not null references productoras(id_productora),
  portero text,                      -- null hasta que el portero activa el turno
  valor_ticket numeric not null default 5,
  -- valores de ticket adicionales cuando la noche tiene multi-precio (ej. 12€ y 6€)
  precios_extra numeric[] not null default '{}',
  hora_apertura timestamptz,          -- null hasta que se activa
  hora_cierre timestamptz,
  -- placeholder manual hasta que exista un import real de Revolut
  barra_revenue numeric not null default 0,
  -- arqueo de caja al cierre → varianza (ver migración 012). fondo = con cuánto
  -- arranca la caja; efectivo_contado NULL = todavía no se arqueó ese turno.
  fondo_caja numeric not null default 250,
  efectivo_contado numeric,
  -- programado (agendado por admin) -> activo (portero lo abrió) -> cerrado
  estado text not null default 'activo' check (estado in ('programado', 'activo', 'cerrado'))
);

create table ingresos (
  id_ingreso uuid primary key default gen_random_uuid(), -- generado en el cliente, permite insert idempotente
  id_turno uuid not null references turnos(id_turno),
  timestamp timestamptz not null default now(),
  tipo text not null check (tipo in ('free_23h', 'free_lista', 'ticket', 'guardarropa')),
  es_ra boolean not null default false,
  valor numeric not null default 0,
  -- para FREE 303 (free en el momento) y free por lista: quién metió esa entrada
  id_organizador uuid references organizadores(id_organizador),
  constraint guardarropa_no_ra check (not (tipo = 'guardarropa' and es_ra))
);

create table lista (
  id_lista uuid primary key default gen_random_uuid(),
  id_turno uuid not null references turnos(id_turno),
  nombre text not null,
  nombre_normalizado text generated always as (lower(immutable_unaccent(nombre))) stored,
  cargado_por text not null,
  entro boolean not null default false,
  hora_entro timestamptz
);

-- Import real de barra (Revolut POS), migración 013 — transacciones crudas
-- (cash/card por venta), no un solo número manual por noche. El `id_turno`
-- lo completa solo un trigger (ver más abajo, junto a noche_303) según la
-- hora de la venta — así el matching vive en un solo lugar sin importar
-- qué camino inserte filas acá (import directo desde admin, a futuro n8n).
create table barra_transacciones (
  id_transaccion uuid primary key default gen_random_uuid(),
  id_cliente uuid not null references clientes(id_cliente),
  id_turno uuid references turnos(id_turno), -- null si no matcheó ninguna noche cargada
  receipt_ref text not null,
  timestamp_utc timestamptz not null,
  metodo_pago text not null check (metodo_pago in ('cash', 'card')),
  subtotal numeric not null default 0,
  impuestos numeric not null default 0,
  propina numeric not null default 0,
  total numeric not null default 0,
  estado_pos text not null default 'Completed',
  origen text not null default 'revolut_pos',
  creado_en timestamptz not null default now(),
  unique (id_cliente, receipt_ref)
);

-- Asocia cada usuario de Supabase Auth a un rol y a los clientes que puede operar.
-- rol='admin' ignora la restriccion de cliente (ver policies).
create table usuarios_clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  id_cliente uuid references clientes(id_cliente), -- null permitido solo para admin
  rol text not null check (rol in ('portero', 'organizador', 'admin'))
);

-- ============================================================
-- INDICES
-- ============================================================

create index idx_turnos_cliente on turnos(id_cliente);
-- Solo un turno ACTIVO por cliente a la vez (los programados futuros no bloquean).
create unique index idx_un_turno_activo_por_cliente on turnos(id_cliente) where estado = 'activo';
-- Un solo turno por fecha por cliente (migración 014) — evita cargar dos
-- eventos el mismo día en el mismo local, sea cual sea su estado.
create unique index idx_turnos_un_evento_por_dia on turnos(id_cliente, fecha);
create index idx_ingresos_turno on ingresos(id_turno);
create index idx_ingresos_timestamp on ingresos(timestamp);
create index idx_lista_turno on lista(id_turno);
create index idx_lista_nombre_normalizado on lista(nombre_normalizado);
create index idx_usuarios_clientes_user on usuarios_clientes(user_id);
create index idx_organizadores_cliente on organizadores(id_cliente);
create index idx_productoras_cliente on productoras(id_cliente);
create index idx_barra_transacciones_turno on barra_transacciones(id_turno);
create index idx_barra_transacciones_cliente on barra_transacciones(id_cliente);

-- ============================================================
-- HELPERS PARA RLS
-- ============================================================

create function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from usuarios_clientes
    where user_id = auth.uid() and rol = 'admin'
  );
$$;

create function clientes_permitidos()
returns setof uuid
language sql
security definer
stable
as $$
  select id_cliente from usuarios_clientes
  where user_id = auth.uid() and id_cliente is not null;
$$;

-- ============================================================
-- REGLA DE NOCHE DE NEGOCIO
-- ============================================================

-- A qué turno pertenece un evento externo fechado por timestamp (venta de barra
-- en Revolut, ticket online de RA). Los taps de puerta NO usan esto (van atados
-- al turno activo); es solo para cruzar data externa por hora.
-- Corte a las 06:00 hora Barcelona: jue hasta 04:00 vie = jueves, etc. El
-- `at time zone` evita que un timestamptz UTC corra la fecha en la madrugada.
create or replace function noche_303(ts timestamptz)
returns date
language sql
immutable
as $$
  select ((ts at time zone 'Europe/Madrid') - interval '6 hours')::date
$$;

-- Completa barra_transacciones.id_turno solo, usando la misma regla de
-- noche_303. Ver migración 013.
create or replace function _asignar_turno_barra()
returns trigger
language plpgsql
as $$
declare
  v_fecha date;
begin
  v_fecha := noche_303(new.timestamp_utc);
  select id_turno into new.id_turno
    from turnos
    where id_cliente = new.id_cliente and fecha = v_fecha
    limit 1;
  return new;
end;
$$;

create trigger trg_asignar_turno_barra
  before insert on barra_transacciones
  for each row execute function _asignar_turno_barra();

-- ============================================================
-- RLS
-- ============================================================

alter table clientes enable row level security;
alter table organizadores enable row level security;
alter table productoras enable row level security;
alter table turnos enable row level security;
alter table ingresos enable row level security;
alter table lista enable row level security;
alter table usuarios_clientes enable row level security;
alter table barra_transacciones enable row level security;

-- clientes: cualquier usuario autenticado con acceso a ese cliente (o admin) puede leer
create policy clientes_select on clientes for select
  using (is_admin() or id_cliente in (select clientes_permitidos()));

-- organizadores: leer si el cliente esta permitido (o admin); solo admin da de alta
create policy organizadores_select on organizadores for select
  using (is_admin() or id_cliente in (select clientes_permitidos()));
create policy organizadores_insert on organizadores for insert
  with check (is_admin());
create policy organizadores_update on organizadores for update
  using (is_admin());

-- productoras: leer si el cliente esta permitido (o admin); solo admin da de alta
create policy productoras_select on productoras for select
  using (is_admin() or id_cliente in (select clientes_permitidos()));
create policy productoras_insert on productoras for insert
  with check (is_admin());
create policy productoras_update on productoras for update
  using (is_admin());

-- turnos: leer/escribir solo si el cliente esta permitido (o admin)
create policy turnos_select on turnos for select
  using (is_admin() or id_cliente in (select clientes_permitidos()));
create policy turnos_insert on turnos for insert
  with check (is_admin() or id_cliente in (select clientes_permitidos()));
create policy turnos_update on turnos for update
  using (is_admin() or id_cliente in (select clientes_permitidos()));
create policy turnos_delete on turnos for delete
  using (is_admin());

-- ingresos: se filtran a traves del turno al que pertenecen
create policy ingresos_select on ingresos for select
  using (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = ingresos.id_turno
      and t.id_cliente in (select clientes_permitidos())
    )
  );
create policy ingresos_insert on ingresos for insert
  with check (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = ingresos.id_turno
      and t.id_cliente in (select clientes_permitidos())
      and t.estado = 'activo'
    )
  );
create policy ingresos_delete on ingresos for delete
  using (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = ingresos.id_turno
      and t.id_cliente in (select clientes_permitidos())
      and t.estado = 'activo'
    )
  );

-- lista: mismo criterio que ingresos
create policy lista_select on lista for select
  using (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = lista.id_turno
      and t.id_cliente in (select clientes_permitidos())
    )
  );
create policy lista_insert on lista for insert
  with check (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = lista.id_turno
      and t.id_cliente in (select clientes_permitidos())
      and t.estado <> 'cerrado'
    )
  );
create policy lista_update on lista for update
  using (
    is_admin() or exists (
      select 1 from turnos t
      where t.id_turno = lista.id_turno
      and t.id_cliente in (select clientes_permitidos())
      and t.estado = 'activo'
    )
  );
-- Borrar nombres: solo admin (para cancelar una noche que ya tiene lista cargada)
create policy lista_delete on lista for delete using (is_admin());

-- usuarios_clientes: solo el admin gestiona altas
create policy usuarios_clientes_select on usuarios_clientes for select
  using (is_admin() or user_id = auth.uid());
create policy usuarios_clientes_insert on usuarios_clientes for insert
  with check (is_admin());

-- barra_transacciones: mismo criterio que turnos
create policy barra_transacciones_select on barra_transacciones for select
  using (is_admin() or id_cliente in (select clientes_permitidos()));
create policy barra_transacciones_insert on barra_transacciones for insert
  with check (is_admin() or id_cliente in (select clientes_permitidos()));
create policy barra_transacciones_delete on barra_transacciones for delete
  using (is_admin());

-- ============================================================
-- VISTAS DE AGREGACION
-- ============================================================

-- Totales por turno, agregados DENTRO de Postgres. admin/ y dashboard/ nunca
-- deben traer cada fila de `ingresos` al navegador para sumarla ahi: la API
-- REST corta en 1000 filas por default, y con miles de ingresos acumulados
-- eso trunca la suma en silencio. Esta vista devuelve una fila por turno,
-- nunca una por tap, asi que el limite deja de importar.
-- security_invoker=true es obligatorio: sin esto, como la vista la crea un
-- rol con BYPASSRLS, saltearia la RLS de `ingresos` por completo.
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

-- Análoga a turno_totales, para barra_transacciones (migración 013).
create or replace view barra_totales
with (security_invoker = true)
as
select
  id_turno,
  count(*) as transacciones,
  coalesce(sum(subtotal), 0) as subtotal,
  coalesce(sum(impuestos), 0) as impuestos,
  coalesce(sum(propina), 0) as propina,
  coalesce(sum(total), 0) as total,
  coalesce(sum(total) filter (where metodo_pago = 'cash'), 0) as total_cash,
  coalesce(sum(total) filter (where metodo_pago = 'card'), 0) as total_card
from barra_transacciones
where id_turno is not null and estado_pos = 'Completed'
group by id_turno;

grant select on barra_totales to anon, authenticated;
