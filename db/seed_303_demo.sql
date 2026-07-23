-- ============================================================
-- 303 · Seed de demo (historia simulada para poblar el dashboard)
-- ============================================================
-- Corre ENTERO en Supabase > SQL Editor. Es data INVENTADA, para ver el
-- dashboard con contenido creíble y reconocer patrones. Se borra con
-- db/_limpiar_pruebas.sql antes de operar de verdad.
--
-- BORRA y regenera el histórico del cliente "303 planta baja":
--   turnos + ingresos + lista + productoras de ese cliente.
--   (No toca clientes ni usuarios.)
--
-- Qué simula:
--   - Fines de semana jue/vie/sáb de los últimos 7 meses + algunos feriados sueltos.
--   - ~15 productoras (rotan, 1-2 por mes cuando están activas) + "303" (la casa,
--     0%/0% de reparto, más eventos que el resto).
--   - Puerta y barra con rangos realistas (~60-80 pagos a €12, barra ~€2-3k).
--   - Free = 50% "antes 23h" + 50% "lista/pasando".
--   - Patrones reconocibles: sáb>vie>jue, leve crecimiento del venue mes a mes,
--     una productora claramente en alza (Aurora) y otra en caída (Cafe Underground),
--     premium vs. masiva, algunas muy volátiles (swing), y noches outlier ocasionales
--     (alguna explosiva, algún fracaso).
-- Requiere migración 009 aplicada (pct_puerta/pct_barra, barra_revenue).

do $$
declare
  v_cliente uuid;
  v_prod uuid;
  v_fecha date;
  v_att int;
  v_bar numeric;
  v_apertura timestamptz;
  v_portero text;
  v_turno uuid;
  v_age numeric;
  v_dow int;
  v_dowf numeric;
  v_trendf numeric;
  v_globalf numeric;
  v_volf numeric;
  v_r numeric;
  v_tipo text;
  v_esra boolean;
  v_valor numeric;
  v_hora timestamptz;
  v_j int;
  v_guarda int;
  v_esperado numeric;
  v_var numeric;
  v_fondo numeric := 250;
  rec record;
  v_window_months int := 7;
  porteros text[] := array['Marco','Diego','Sofia','Nico','Julia','Bruno','Lu'];
begin
  select id_cliente into v_cliente from clientes where nombre = '303 planta baja' limit 1;
  if v_cliente is null then
    insert into clientes (nombre) values ('303 planta baja') returning id_cliente into v_cliente;
  end if;

  -- limpieza total del histórico de este cliente
  delete from ingresos where id_turno in (select id_turno from turnos where id_cliente = v_cliente);
  delete from lista    where id_turno in (select id_turno from turnos where id_cliente = v_cliente);
  delete from turnos     where id_cliente = v_cliente;
  delete from productoras where id_cliente = v_cliente;

  -- Perfiles: weight = frecuencia relativa; att_base = asistencia típica antes de
  -- factores; ticket_share = % que paga; ra_rate = % que entra por RA (compró online);
  -- price = valor ticket; bar_pp = gasto de barra por persona; trend = crecimiento/mes;
  -- vol = volatilidad noche a noche (swing).
  create temporary table prof (
    nombre text, weight numeric, att_base int, ticket_share numeric, ra_rate numeric,
    price numeric, bar_pp numeric, pct_puerta numeric, pct_barra numeric, trend numeric, vol numeric
  ) on commit drop;
  insert into prof values
    ('303',              2.5, 100, 0.40, 0.12, 10, 18,  0,  0,  0.015, 0.15),  -- la casa, más eventos, 0/0
    ('Vertice',          1.6, 120, 0.52, 0.15, 12, 19, 20, 30,  0.000, 0.10),  -- headliner estable
    ('Les Enfants',      1.7, 100, 0.30, 0.25,  8, 15, 20, 30,  0.000, 0.34),  -- muy volátil (swing alto)
    ('Insomnia',         1.6,  95, 0.25, 0.32,  8, 14, 20, 30,  0.000, 0.30),  -- mucho RA, volátil
    ('Aurora',           1.2,  75, 0.50, 0.15, 10, 17, 20, 30,  0.060, 0.14),  -- EN ALZA (notable)
    ('Cafe Underground', 1.0,  72, 0.28, 0.10,  6, 12, 20, 30, -0.060, 0.18),  -- EN CAÍDA (notable)
    ('Keller',           1.1,  70, 0.70, 0.10, 14, 24, 20, 30,  0.000, 0.12),  -- premium, caro
    ('Subsuelo',         0.7,  58, 0.75, 0.05, 15, 26, 20, 30,  0.000, 0.10),  -- muy premium, raro
    ('Macarena',         1.2,  95, 0.42, 0.12,  8, 16, 20, 30,  0.010, 0.13),  -- consistente
    ('Bloom',            1.1, 140, 0.15, 0.10,  5, 12, 20, 30,  0.000, 0.15),  -- llena la sala, monetiza poco
    ('Rave Republic',    1.1, 150, 0.12, 0.20,  5, 11, 20, 30,  0.005, 0.16),  -- la más grande, peor paga
    ('Marea',            0.7,  85, 0.45, 0.10,  7, 16, 20, 30,  0.000, 0.12),  -- balanceada, raro
    ('Neon',             1.1,  90, 0.50, 0.12, 10, 18, 20, 30,  0.020, 0.14),
    ('Cobalto',          0.8,  75, 0.60, 0.12, 12, 21, 20, 30,  0.000, 0.13),  -- premium-ish
    ('Sahara',           1.0, 130, 0.18, 0.14,  6, 12, 20, 30, -0.010, 0.16),  -- masiva low-pay
    ('Pulso',            0.8,  80, 0.40, 0.20,  9, 15, 20, 30,  0.030, 0.28);  -- newcomer volátil

  for rec in select * from prof loop
    insert into productoras (id_cliente, nombre, pct_puerta, pct_barra)
    values (v_cliente, rec.nombre, rec.pct_puerta, rec.pct_barra);
  end loop;

  -- Pool de fechas: jue/vie/sáb de la ventana + ~7 feriados sueltos (entre semana).
  create temporary table dpool (fecha date) on commit drop;
  insert into dpool
    select d::date from generate_series(current_date - (v_window_months || ' months')::interval, current_date - interval '3 days', '1 day') d
    where extract(dow from d) in (4,5,6);
  insert into dpool
    select fecha from (
      select d::date as fecha from generate_series(current_date - (v_window_months || ' months')::interval, current_date - interval '3 days', '1 day') d
      where extract(dow from d) not in (4,5,6)
      order by random() limit 7
    ) q;

  for v_fecha in select fecha from dpool order by fecha loop
    -- productora por peso (muestreo ponderado)
    select p.* into rec from prof p order by (-ln(random() + 1e-9) / p.weight) asc limit 1;
    select id_productora into v_prod from productoras where id_cliente = v_cliente and nombre = rec.nombre;

    v_dow  := extract(dow from v_fecha)::int;
    v_dowf := case v_dow when 6 then 1.12 when 5 then 1.00 when 4 then 0.86 else 0.78 end; -- sáb>vie>jue; feriado suelto flojo
    v_age  := (extract(year from current_date) - extract(year from v_fecha)) * 12 + (extract(month from current_date) - extract(month from v_fecha));
    v_trendf  := 1 + rec.trend * (v_window_months - v_age);           -- alza/caída por productora
    v_globalf := 1 + 0.015 * (v_window_months - v_age);              -- leve crecimiento del venue
    v_volf    := 1 - rec.vol + random() * 2 * rec.vol;               -- swing

    v_att := (round(rec.att_base * v_dowf * greatest(v_trendf, 0.3) * v_globalf * v_volf))::int;
    if random() < 0.04 then v_att := (round(v_att * (1.6 + random() * 0.3)))::int; end if;   -- noche explosiva (rara)
    if random() < 0.04 then v_att := (round(v_att * (0.40 + random() * 0.15)))::int; end if; -- fracaso (raro)
    v_att := greatest(25, least(210, v_att));

    v_bar := round(v_att * rec.bar_pp * (0.85 + random() * 0.30));
    v_portero := porteros[1 + floor(random() * array_length(porteros, 1))::int];
    v_apertura := v_fecha + time '23:00';

    insert into turnos (id_cliente, id_productora, fecha, portero, valor_ticket, hora_apertura, hora_cierre, estado, barra_revenue)
    values (v_cliente, v_prod, v_fecha, v_portero, rec.price, v_apertura, v_apertura + interval '5 hours 30 minutes', 'cerrado', v_bar)
    returning id_turno into v_turno;

    v_esperado := 0;  -- efectivo que la caja debería tener (tickets no-RA + guardarropa)
    for v_j in 1..v_att loop
      v_r := random();
      if v_r < rec.ra_rate then
        v_tipo := 'ticket'; v_esra := true;  v_valor := rec.price;   -- RA: compró online, entra como RA
      elsif v_r < rec.ra_rate + rec.ticket_share then
        v_tipo := 'ticket'; v_esra := false; v_valor := rec.price;   -- pagó en la puerta
      else
        v_tipo := case when random() < 0.5 then 'free_lista' else 'free_23h' end; -- free 50/50
        v_esra := false; v_valor := 0;
      end if;
      v_hora := v_apertura + (random() * interval '5 hours');
      insert into ingresos (id_turno, timestamp, tipo, es_ra, valor) values (v_turno, v_hora, v_tipo, v_esra, v_valor);
      if v_tipo = 'ticket' and not v_esra then v_esperado := v_esperado + v_valor; end if;
    end loop;

    v_guarda := floor(v_att * (0.30 + random() * 0.25))::int;
    for v_j in 1..v_guarda loop
      v_hora := v_apertura + (random() * interval '5 hours');
      insert into ingresos (id_turno, timestamp, tipo, es_ra, valor) values (v_turno, v_hora, 'guardarropa', false, 2);
    end loop;
    v_esperado := v_esperado + v_guarda * 2;

    -- Arqueo simulado: la mayoría cuadra o falta poco; ~12% con faltante notorio.
    v_var := round(-4 + random() * 4);
    if random() < 0.12 then v_var := v_var - round(20 + random() * 60); end if;
    update turnos set fondo_caja = v_fondo, efectivo_contado = v_fondo + v_esperado + v_var
    where id_turno = v_turno;
  end loop;

  -- Unas noches futuras 'programado' para que puerta / lista / agenda no queden vacías.
  insert into turnos (id_cliente, id_productora, fecha, valor_ticket, estado)
  select v_cliente,
         (select id_productora from productoras where id_cliente = v_cliente order by random() limit 1),
         d::date, 12, 'programado'
  from generate_series(current_date + interval '2 days', current_date + interval '24 days', '1 day') d
  where extract(dow from d) in (4,5,6)
  limit 3;
end $$;

-- Control: una fila por productora con sus promedios.
select p.nombre,
       count(*)                     as noches,
       round(avg(tt.personas))      as att_prom,
       round(avg(tt.door_revenue))  as door_prom,
       round(avg(t.barra_revenue))  as barra_prom,
       min(t.fecha)                 as desde,
       max(t.fecha)                 as hasta
from turnos t
join productoras p    on p.id_productora = t.id_productora
join turno_totales tt on tt.id_turno = t.id_turno
where t.id_cliente = (select id_cliente from clientes where nombre = '303 planta baja')
  and t.estado = 'cerrado'
group by p.nombre
order by noches desc;
