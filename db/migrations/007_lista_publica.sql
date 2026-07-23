-- Formulario público de lista (sin login). El organizador entra a un link,
-- elige su nombre, pone su PIN y pega los nombres — sin cuenta ni sesión.
--
-- Estas tres funciones SECURITY DEFINER corren con privilegios del dueño
-- (bypassean RLS), así que:
--  - el PIN se valida DENTRO del servidor: el navegador nunca recibe los PINs.
--  - anon no puede insertar en `lista` de forma arbitraria: solo vía cargar_lista().
-- Correr entero en el SQL Editor.

-- Noches disponibles para cargar lista (programadas o en curso), con cliente y productora.
create or replace function nights_para_lista()
returns table (id_turno uuid, id_cliente uuid, fecha date, cliente text, productora text, estado text)
language sql security definer stable
set search_path = public
as $$
  select t.id_turno, t.id_cliente, t.fecha, c.nombre, p.nombre, t.estado
  from turnos t
  join clientes c on c.id_cliente = t.id_cliente
  join productoras p on p.id_productora = t.id_productora
  where t.estado in ('programado', 'activo')
  order by t.fecha;
$$;

-- Organizadores activos de un cliente. NO expone el PIN.
create or replace function organizadores_para_lista(p_id_cliente uuid)
returns table (id_organizador uuid, nombre text)
language sql security definer stable
set search_path = public
as $$
  select id_organizador, nombre from organizadores
  where id_cliente = p_id_cliente and activo = true
  order by nombre;
$$;

-- Carga nombres validando el PIN server-side. Devuelve el total de nombres
-- que quedaron en esa noche (para que el organizador corrobore).
create or replace function cargar_lista(
  p_id_turno uuid, p_id_organizador uuid, p_pin text, p_nombres text[]
) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_estado text;
  v_cliente_turno uuid;
  v_org organizadores%rowtype;
  v_nombre text;
  v_total integer;
begin
  select estado, id_cliente into v_estado, v_cliente_turno from turnos where id_turno = p_id_turno;
  if v_estado is null or v_estado = 'cerrado' then
    raise exception 'noche no disponible';
  end if;

  select * into v_org from organizadores where id_organizador = p_id_organizador and activo = true;
  if v_org.id_organizador is null or v_org.id_cliente <> v_cliente_turno or v_org.pin <> p_pin then
    raise exception 'PIN incorrecto';
  end if;

  foreach v_nombre in array p_nombres loop
    if length(btrim(v_nombre)) > 0 then
      insert into lista (id_turno, nombre, cargado_por) values (p_id_turno, btrim(v_nombre), v_org.nombre);
    end if;
  end loop;

  select count(*) into v_total from lista where id_turno = p_id_turno;
  return v_total;
end;
$$;

grant execute on function nights_para_lista() to anon, authenticated;
grant execute on function organizadores_para_lista(uuid) to anon, authenticated;
grant execute on function cargar_lista(uuid, uuid, text, text[]) to anon, authenticated;
