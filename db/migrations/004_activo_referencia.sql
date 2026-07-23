-- "Baja" de productoras/organizadores desde el panel admin.
-- No se borran filas: una productora ya usada en un turno está referenciada
-- por FK y el delete fallaría. En cambio se marca activo=false (soft-delete):
-- desaparece del desplegable de la puerta, pero el histórico queda intacto.

alter table productoras add column activo boolean not null default true;
alter table organizadores add column activo boolean not null default true;

-- El admin necesita poder actualizar (activo, o renombrar) — antes no había UPDATE.
create policy productoras_update on productoras for update using (is_admin());
create policy organizadores_update on organizadores for update using (is_admin());
