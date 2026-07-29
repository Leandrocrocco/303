# CLAUDE.md — 303

Guía de trabajo del proyecto para Claude Code y para cualquiera que contribuya. Notas
personales y de contexto no público viven en `CLAUDE.local.md` (no versionado).

## Qué es 303

Plataforma de operaciones y analítica para un club nocturno: captura la asistencia de puerta
en tiempo real (conteo por tap) y la cruza con la facturación de barra para dar métricas de
negocio fiables — reemplazando una planilla manual por datos en vivo y reconciliados.

Frontend estático **sin build** (vanilla ES modules) sobre **Supabase** (PostgreSQL + Auth +
Row-Level Security). Pensado para funcionar offline en la puerta y escalar a varios locales.

## Apps

| App | Usuario | Función | Idioma |
|-----|---------|---------|--------|
| `puerta/` | Portero | Conteo por tap, cola offline, arqueo y cierre de turno | ES |
| `lista/` | Organizadores | Alta de invitados (form público, PIN validado server-side) | ES |
| `admin/` | Operador | Agenda, productoras, % de reparto, barra | ES |
| `dashboard/` | Dueño | Analítica (5 pestañas) | EN |
| `index.html` | — | Landing | ES |

Cada app: `index.html` fino + `app.js` (orquesta la UI) + `data.js` (única capa que habla con
Supabase). El dashboard se subdivide en `tabs/*.js` con un contrato `render()` / `wire()`, así
se agrega una pestaña sin tocar las demás.

## Decisiones de arquitectura (con su porqué — no re-litigar)

- **Conteo offline-first.** Los taps son optimistas en la UI y se encolan en IndexedDB
  (`shared/queue.js`); cada registro lleva un UUID generado en cliente → inserts **idempotentes**
  (sin doble conteo si la red parpadea). `ingresos` es append-only: no hay conflictos de sync.
- **Agregación dentro de Postgres.** La API REST corta en 1000 filas y truncaría sumas en
  silencio con meses de datos. Se agrega en **vistas** (`turno_totales`, `lista_conteo`) creadas
  con `security_invoker = true` para no saltear RLS. El frontend nunca suma filas crudas.
- **Lista sin login, asegurada en la base.** Los organizadores usan un link público; los PIN se
  validan en funciones `SECURITY DEFINER`, así el navegador nunca los recibe y `anon` no puede
  insertar filas arbitrarias.
- **Candado anti-doble-entrada a nivel DB.** Marcar un invitado es un `UPDATE ... WHERE
  entro = false`; un segundo intento matchea cero filas y se rechaza. Seguro con dos porteros a la vez.
- **Multi-tenant con RLS.** `usuarios_clientes` + policies acotan cada lectura/escritura por local.
- **Fechas con componentes locales, nunca UTC** (`toISOString().slice(0,10)` corre la fecha de
  negocio en la madrugada — bug real ya resuelto).

## Modelo de datos (núcleo)

- **`turnos`** — una noche: `programado → activo → cerrado`, con campos de arqueo de caja.
- **`ingresos`** — una fila por entrada real (tap): free / ticket pagado / online / guardarropa.
  Fuente de verdad para el conteo.
- **`lista`** — nombres invitados por noche, con flag `entro` que se marca al ingresar.
- **`productoras`** — con reparto por-productora (`pct_puerta`, `pct_barra`).
- Schema e historial de migraciones en [`db/`](db/). `net = door·(1−pct_puerta) + barra·(1−pct_barra)`.

## Convenciones y calidad

- **Sin build, sin framework, sin dependencias** salvo razón fuerte (menos superficie de ataque
  y mantenimiento). Estilo: escribir como el código de alrededor.
- **Frontend, gates verificables:** centrado/alineación confirmados por medición (no a ojo); nada
  de scroll horizontal (medir `scrollWidth === clientWidth`); no romper estado de UX al
  re-renderizar (preferir update en el sitio); responsive mobile + desktop; paleta consistente.
  Respetar el scope de lo pedido (si es "solo colores", solo color).
- **Verificar contra lo real**, no "debería funcionar". Para lo que está detrás de login: validar
  sintaxis, carga sin errores de consola y medición del layout con el CSS real; ser explícito con
  lo que no se pudo probar logueado.

## Seguridad

- **RLS es la seguridad real.** La anon key es pública por diseño; lo que protege los datos son las
  policies. Al agregar/tocar una tabla, verificar que tenga RLS con policies correctas.
- **En el frontend no hay secretos.** La única clave del repo es la anon/publishable de Supabase.
  Secretos reales (si algún día hay pagos/integraciones) van en variables de entorno de una Edge
  Function, nunca en el repo.
- Tratar todo input de usuario como no confiable; validar server-side.

## Base de datos y deploy

- **Migraciones a mano:** el `.sql` se escribe en `db/migrations/NNN_...`, se corre en el SQL
  Editor de Supabase y se verifica antes de seguir. `schema.sql` se mantiene al día. No hay CLI conectada.
- **Deploy:** `git push origin main` → GitHub Pages (~1-2 min). Al cambiar comportamiento, subir
  `APP_VERSION` en `shared/config.js` (sello de versión visible, para detectar caché viejo).
- Commits/push: solo cuando se piden.
