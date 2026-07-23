import { haySesion, iniciarSesion } from './auth.js';
import {
  cargarClientesYProductoras,
  buscarTurnoActivo,
  listarNochesProgramadas,
  activarNoche,
  crearTurnoAlVuelo,
  cancelarApertura,
  resumirDesdeServidor,
  editarTurno,
  cerrarTurno,
  calcularDesgloseCierre,
  listarOrganizadoresPuerta,
} from './turno.js';
import { registrarTap, deshacerUltimo, resetearTurno, registrarFree303 } from './conteo.js';
import { refrescarLista, buscar, marcarEntrada } from './lista.js';
import { estado, eventos, notificar } from './estado.js';
import { eventos as eventosCola, contarPendientes } from '../shared/queue.js';
import { APP_VERSION } from '../shared/config.js';

const app = document.getElementById('app');
// Link "volver al menú" — se muestra fuera de la botonera en vivo (para no salir
// sin querer a mitad de noche). El sello de versión ayuda a detectar caché viejo.
const BACK_LINK = '<a href="../" style="display:inline-flex;align-items:center;gap:5px;color:#c0b8d0;text-decoration:none;background:#1a1826;border:1px solid #2a2838;border-radius:9px;padding:7px 11px;font-size:12px;margin-bottom:14px">← Menú</a>';
let clientesDisponibles = [];
let productorasDisponibles = [];
let pendientesSync = 0;
let editandoCampo = null; // 'fecha' | 'productora' | null
let desglosecierre = null;
let nochesProgramadas = [];
let nocheSeleccionada = null;
let modalFree303 = null; // { cantidad, idOrganizador } | null

// Durante el conteo, un 'cambio' actualiza solo los números en el lugar
// (parchearConteo), no reconstruye la pantalla — reconstruir en cada tap
// causaba el "salto" visual y podía robar el foco del buscador.
// El resto de las vistas sí re-renderizan entero.
eventos.addEventListener('cambio', () => {
  if (estado.vista === 'conteo' && !editandoCampo) parchearConteo();
  else render();
});
eventosCola.addEventListener('pendientes', (e) => {
  pendientesSync = e.detail.cantidad;
  if (estado.vista === 'conteo' && !editandoCampo) parchearConteo();
});
eventosCola.addEventListener('rechazado', (e) => {
  alert(`Un ingreso no se pudo guardar: ${e.detail.tabla} — probablemente el turno ya estaba cerrado.`);
});

async function iniciar() {
  pendientesSync = await contarPendientes();
  if (!(await haySesion())) {
    estado.vista = 'login';
    render();
    return;
  }
  await entrarPostLogin();
}

async function entrarPostLogin() {
  estado.vista = 'cargando';
  render();
  const activo = await buscarTurnoActivo();
  if (activo) {
    await resumirDesdeServidor(activo);
    estado.organizadoresPuerta = await listarOrganizadoresPuerta(activo.id_cliente);
    estado.vista = 'conteo';
    render();
    return;
  }
  // No hay turno activo: mostrar las noches que el admin agendó para elegir una.
  // Si no hay ninguna, caer al formulario de crear una en el acto.
  const [{ clientes, productoras }, programadas] = await Promise.all([
    cargarClientesYProductoras(),
    listarNochesProgramadas(),
  ]);
  clientesDisponibles = clientes;
  productorasDisponibles = productoras;
  nochesProgramadas = programadas;
  estado.vista = programadas.length > 0 ? 'elegir-noche' : 'abrir-turno';
  render();
}

function render() {
  if (estado.vista === 'login') return renderLogin();
  if (estado.vista === 'cargando') return renderCargando();
  if (estado.vista === 'elegir-noche') return renderElegirNoche();
  if (estado.vista === 'activar-noche') return renderActivarNoche();
  if (estado.vista === 'abrir-turno') return renderAbrirTurno();
  if (estado.vista === 'conteo') return renderConteo();
  if (estado.vista === 'cerrar-caja') return renderCerrarCaja();
  if (estado.vista === 'cierre') return renderCierre();
}

function renderCargando() {
  app.innerHTML = `<div class="centrado">Cargando…</div>`;
}

function renderLogin() {
  app.innerHTML = `
    <div class="login">
      ${BACK_LINK}
      <div class="login-t">303 · acceso de puerta</div>
      <form id="f-login">
        <input name="email" type="email" placeholder="usuario" required autocomplete="username" />
        <input name="pass" type="password" placeholder="contraseña" required autocomplete="current-password" />
        <button type="submit">Entrar</button>
        <div class="login-err" id="login-err"></div>
      </form>
      <div style="margin-top:16px;font-size:10px;color:#6a6478;font-family:ui-monospace,Consolas,monospace">${APP_VERSION}</div>
    </div>`;
  document.getElementById('f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await iniciarSesion(f.get('email'), f.get('pass'));
      await entrarPostLogin();
    } catch (err) {
      document.getElementById('login-err').textContent = 'Usuario o contraseña incorrectos.';
    }
  });
}

function fechaLocalHoy() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Entra a la pantalla de conteo cargando del servidor lo que ya exista para ese turno.
// Para un turno recién creado viene todo vacío; para una noche agendada trae la
// lista que el organizador ya había cargado (y cualquier ingreso, si se retoma).
async function entrarAlConteo(turno) {
  estado.undoStack = [];
  estado.vista = 'conteo';
  await resumirDesdeServidor(turno); // setea turno, conteos, caja e listaCache
  estado.organizadoresPuerta = await listarOrganizadoresPuerta(turno.id_cliente);
  render();
}

// Elegir cuál de las noches agendadas se va a operar esta noche.
function renderElegirNoche() {
  const filas = nochesProgramadas
    .map(
      (n) => `
      <button class="noche" data-id="${n.id_turno}">
        <div class="noche-fecha">${n.fecha}</div>
        <div class="noche-prod">${n.productoras?.nombre ?? ''} · ${n.clientes?.nombre ?? ''}</div>
      </button>`
    )
    .join('');
  app.innerHTML = `
    <div class="abrir">
      ${BACK_LINK}
      <div class="abrir-t">Elegí la noche</div>
      <div class="noches">${filas}</div>
      <button class="link-crear" id="btn-crear-vuelo">La noche no está en la lista — crearla ahora</button>
    </div>`;

  app.querySelectorAll('.noche').forEach((btn) => {
    btn.addEventListener('click', () => {
      nocheSeleccionada = nochesProgramadas.find((n) => n.id_turno === btn.dataset.id);
      estado.vista = 'activar-noche';
      render();
    });
  });
  document.getElementById('btn-crear-vuelo').addEventListener('click', () => {
    estado.vista = 'abrir-turno';
    render();
  });
}

// Activar la noche elegida: el portero pone su nombre y confirma el valor del ticket.
function renderActivarNoche() {
  const n = nocheSeleccionada;
  app.innerHTML = `
    <div class="abrir">
      <div class="abrir-t">${n.productoras?.nombre ?? ''}</div>
      <div class="abrir-sub">${n.clientes?.nombre ?? ''} · ${n.fecha}</div>
      <form id="f-activar">
        <label>Valor del ticket (€)
          <input name="valor_ticket" type="number" min="0" step="0.5" required value="${n.valor_ticket}" />
        </label>
        <label>Tu nombre
          <input name="portero" type="text" required placeholder="ej. Marco" />
        </label>
        <button type="submit">Empezar turno</button>
        <button type="button" class="link-crear" id="btn-volver">← Volver</button>
      </form>
    </div>`;

  document.getElementById('btn-volver').addEventListener('click', () => {
    estado.vista = 'elegir-noche';
    render();
  });
  document.getElementById('f-activar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const turno = await activarNoche(n.id_turno, {
        portero: f.get('portero'),
        valor_ticket: Number(f.get('valor_ticket')),
      });
      await entrarAlConteo(turno);
    } catch (err) {
      if (err.code === '23505') {
        alert('Ya hay un turno activo para este cliente. Recargá la app para retomarlo.');
        return;
      }
      alert('No se pudo activar la noche — revisá la conexión e intentá de nuevo.');
    }
  });
}

function renderAbrirTurno() {
  const opcionesClientes = clientesDisponibles
    .map((c) => `<option value="${c.id_cliente}">${c.nombre}</option>`)
    .join('');
  app.innerHTML = `
    <div class="abrir">
      <div class="abrir-t">Abrir turno</div>
      <form id="f-abrir">
        <label>Cliente
          <select name="id_cliente" required>${opcionesClientes}</select>
        </label>
        <label>Productora
          <select name="id_productora" required></select>
        </label>
        <label>Fecha
          <input name="fecha" type="date" required value="${fechaLocalHoy()}" />
        </label>
        <label>Valor del ticket (€)
          <input name="valor_ticket" type="number" min="0" step="0.5" required value="5" />
        </label>
        <label>Tu nombre
          <input name="portero" type="text" required placeholder="ej. Marco" />
        </label>
        <button type="submit">Abrir turno</button>
      </form>
    </div>`;

  const selCliente = document.querySelector('select[name=id_cliente]');
  const selProductora = document.querySelector('select[name=id_productora]');
  function actualizarProductoras() {
    const opciones = productorasDisponibles.filter((p) => p.id_cliente === selCliente.value);
    selProductora.innerHTML = opciones.map((p) => `<option value="${p.id_productora}">${p.nombre}</option>`).join('');
  }
  selCliente.addEventListener('change', actualizarProductoras);
  actualizarProductoras();

  document.getElementById('f-abrir').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let turno;
    try {
      turno = await crearTurnoAlVuelo({
        id_cliente: f.get('id_cliente'),
        id_productora: f.get('id_productora'),
        fecha: f.get('fecha'),
        valor_ticket: Number(f.get('valor_ticket')),
        portero: f.get('portero'),
      });
    } catch (err) {
      if (err.code === '23505') {
        // Índice único idx_un_turno_activo_por_cliente: ya hay un turno activo
        // para este cliente (otro dispositivo, otra pestaña, o uno que quedó abierto).
        alert('Ya hay un turno activo para este cliente. Recargá la app para retomarlo, o cerralo desde el panel admin antes de abrir uno nuevo.');
        return;
      }
      throw err;
    }
    await entrarAlConteo(turno);
  });
}

function totalPersonas() {
  const c = estado.conteos;
  return c.free_23h + c.free_lista + c.ticket;
}

// Actualiza solo los valores que cambian con un tap, sin reconstruir la pantalla.
// Es lo que evita el "salto" visual y preserva el foco del buscador.
function parchearConteo() {
  const c = estado.conteos;
  const total = totalPersonas();
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const set = (sel, val) => { const el = app.querySelector(sel); if (el) el.textContent = val; };

  set('#total-dinero', `€${estado.caja.toFixed(0)}`);
  set('#total-personas', `${total} personas · caja a rendir`);
  set('[data-tipo=free_23h] .c', c.free_23h);
  set('#c-free-lista', c.free_lista);
  set('#c-ticket', c.ticket);
  set('[data-tipo=guardarropa] .c', c.guardarropa);
  set('#lista-entraron', estado.listaCache.filter((l) => l.entro).length);
  set('#lista-total', estado.listaCache.length);

  const ra = app.querySelector('.ra');
  if (ra) {
    ra.classList.toggle('activa', estado.raActiva);
    const box = ra.querySelector('.box');
    if (box) box.textContent = estado.raActiva ? '✓' : '';
  }

  const barra = app.querySelector('#compo-bar');
  if (barra) {
    const spans = barra.querySelectorAll('span');
    if (spans[0]) spans[0].style.width = `${pct(c.free_23h)}%`;
    if (spans[1]) spans[1].style.width = `${pct(c.free_lista)}%`;
    if (spans[2]) spans[2].style.width = `${pct(c.ticket)}%`;
  }
  const leg = app.querySelector('#compo-leg');
  if (leg) {
    const items = leg.querySelectorAll('.cl');
    if (items[0]) items[0].innerHTML = `<span class="d" style="background:#5cc8ff"></span>Free 23h ${pct(c.free_23h)}%`;
    if (items[1]) items[1].innerHTML = `<span class="d" style="background:#3f6db0"></span>Lista ${pct(c.free_lista)}%`;
    if (items[2]) items[2].innerHTML = `<span class="d" style="background:#ff6ec7"></span>Ticket ${pct(c.ticket)}%`;
  }

  const undo = app.querySelector('[data-action=deshacer]');
  if (undo) undo.disabled = estado.undoStack.length === 0;

  pintarBadgeSync();
}

// El badge solo se muestra si algo queda sin sincronizar por más de ~2s
// (o sea, red caída de verdad). En el ciclo normal online el tap sincroniza
// en <1s, así que el badge nunca llega a aparecer — sin parpadeo amarillo.
let syncBadgeTimer = null;
function pintarBadgeSync() {
  const slot = app.querySelector('#sync-slot');
  if (!slot) return;
  if (pendientesSync === 0) {
    if (syncBadgeTimer) { clearTimeout(syncBadgeTimer); syncBadgeTimer = null; }
    slot.innerHTML = '';
    return;
  }
  if (slot.firstChild) {
    slot.firstChild.textContent = `${pendientesSync} sin sincronizar`;
    return;
  }
  if (!syncBadgeTimer) {
    syncBadgeTimer = setTimeout(() => {
      syncBadgeTimer = null;
      const s = app.querySelector('#sync-slot');
      if (s && pendientesSync > 0) {
        s.innerHTML = `<div class="sync-badge">${pendientesSync} sin sincronizar</div>`;
      }
    }, 2000);
  }
}

function chipFecha() {
  if (editandoCampo === 'fecha') {
    return `<input type="date" id="edit-fecha" class="b-chip-edit" value="${estado.turno.fecha}" />`;
  }
  return `<span class="b-chip" data-action="editar-fecha">📅 ${estado.turno.fecha} ✎</span>`;
}

function chipProductora() {
  if (editandoCampo === 'productora') {
    const opciones = productorasDisponibles
      .filter((p) => p.id_cliente === estado.turno.id_cliente)
      .map((p) => `<option value="${p.id_productora}" ${p.id_productora === estado.turno.id_productora ? 'selected' : ''}>${p.nombre}</option>`)
      .join('');
    return `<select id="edit-productora" class="b-chip-edit">${opciones}</select>`;
  }
  return `<span class="b-chip" data-action="editar-productora">◈ ${estado.turno.productoras?.nombre ?? ''} ✎</span>`;
}

function renderConteo() {
  const c = estado.conteos;
  const total = totalPersonas();
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  app.innerHTML = `
    <div class="m2">
      <div id="sync-slot">${pendientesSync > 0 ? `<div class="sync-badge">${pendientesSync} sin sincronizar</div>` : ''}</div>
      <div class="b-hdr">
        <div class="b-place">303 · ${estado.turno.clientes?.nombre ?? ''} <span style="font-size:9px;color:#6a6478;font-weight:400">${APP_VERSION}</span></div>
        <div class="b-editrow">
          ${chipFecha()}
          ${chipProductora()}
          <span class="b-chip">${estado.turno.portero}</span>
          <span class="b-chip back" data-action="cancelar-apertura">↩ volver a agenda</span>
        </div>
      </div>
      <div class="b-total">
        <div class="b-total-v" id="total-dinero">€${estado.caja.toFixed(0)}</div>
        <div class="b-total-l" id="total-personas">${total} personas · caja a rendir</div>
      </div>
      <!-- Fila 1: los dos free — mismo color, distinto tono. FREE LISTA no cuenta al tap: enfoca el buscador. -->
      <div class="b-grid2">
        <button class="bbtn free23" data-action="tap" data-tipo="free_23h"><span class="l">FREE ANTES 23H</span><span class="c">${c.free_23h}</span></button>
        <button class="bbtn freelista" type="button" data-action="focus-buscador"><span class="l">FREE LISTA <span class="hint">🔍 buscar</span></span><span class="c" id="c-free-lista">${c.free_lista}</span></button>
      </div>
      <!-- Fila 2: ticket único (más ancho) + checkbox RA -->
      <div class="tk-row">
        <button class="tkbtn" data-action="tap" data-tipo="ticket" data-valor="${Number(estado.turno.valor_ticket)}">
          <div><div class="l">TICKET</div><div class="val">${Number(estado.turno.valor_ticket)}€</div></div>
          <div class="c" id="c-ticket">${c.ticket}</div>
        </button>
        <button class="ra ${estado.raActiva ? 'activa' : ''}" data-action="toggle-ra">
          <div class="box">${estado.raActiva ? '✓' : ''}</div>
          <div class="t">RA</div>
          <div class="s">marca el próximo</div>
        </button>
      </div>
      <!-- Fila 3: guardarropa + FREE 303 (rojo característico) -->
      <div class="b-grid2" style="margin-top:8px">
        <button class="guar" data-action="tap" data-tipo="guardarropa">
          <div><div class="l">GUARDARROPA</div><div class="s">2 € por prenda</div></div>
          <div class="c">${c.guardarropa}</div>
        </button>
        <button class="f303" data-action="abrir-free303">
          <div><div class="l">FREE 303</div><div class="s">pasar sin lista</div></div>
          <span class="f303-ic">＋</span>
        </button>
      </div>
      <div class="lz">
        <input id="buscador" class="lz-s" placeholder="🔍 Buscar nombre en lista…" autocomplete="off" />
        <div class="lz-res" id="lz-res"></div>
        <div class="lz-meta">
          <span>Lista de la noche <button class="lz-refresh" data-action="refrescar-lista">↻</button></span>
          <span><b id="lista-entraron">${estado.listaCache.filter((l) => l.entro).length}</b> / <span id="lista-total">${estado.listaCache.length}</span> ingresados</span>
        </div>
      </div>
      <div class="compo">
        <div class="compo-l">COMPOSICIÓN DE LA NOCHE</div>
        <div class="compo-bar" id="compo-bar">
          <span style="width:${pct(c.free_23h)}%;background:#5cc8ff"></span>
          <span style="width:${pct(c.free_lista)}%;background:#3f6db0"></span>
          <span style="width:${pct(c.ticket)}%;background:#ff6ec7"></span>
        </div>
        <div class="compo-leg" id="compo-leg">
          <span class="cl"><span class="d" style="background:#5cc8ff"></span>Free 23h ${pct(c.free_23h)}%</span>
          <span class="cl"><span class="d" style="background:#3f6db0"></span>Lista ${pct(c.free_lista)}%</span>
          <span class="cl"><span class="d" style="background:#ff6ec7"></span>Ticket ${pct(c.ticket)}%</span>
        </div>
      </div>
      <div class="b-foot">
        <button class="bf gh" data-action="deshacer" ${estado.undoStack.length === 0 ? 'disabled' : ''}>↶ Deshacer</button>
        <button class="bf rs" data-action="reset">Reset</button>
        <button class="bf sl" data-action="cerrar-turno">Cerrar turno</button>
      </div>
    </div>
    ${modalFree303 ? renderModalFree303() : ''}`;

  cablearConteo();
}

function renderModalFree303() {
  const opciones = estado.organizadoresPuerta
    .map((o) => `<option value="${o.id_organizador}">${o.nombre}</option>`)
    .join('');
  return `
    <div class="modal-bg" data-action="cerrar-modal-fondo">
      <div class="modal-card" data-stop-click>
        <div class="modal-t">FREE 303 — pasar sin lista</div>
        ${estado.organizadoresPuerta.length === 0 ? '<div style="font-size:12px;color:#d4a0a0">No hay organizadores cargados para este cliente.</div>' : `
        <div class="mrow">
          <span class="mlbl">Cantidad</span>
          <div class="step">
            <button type="button" data-action="free303-menos">−</button>
            <span class="n">${modalFree303.cantidad}</span>
            <button type="button" data-action="free303-mas">+</button>
          </div>
        </div>
        <div class="mrow">
          <span class="mlbl">Los hizo entrar</span>
          <select id="free303-organizador">${opciones}</select>
        </div>
        <button class="modal-conf" data-action="confirmar-free303">Confirmar · ${modalFree303.cantidad} free</button>`}
        <button class="modal-cancel" data-action="cerrar-modal">Cancelar</button>
      </div>
    </div>`;
}

function cablearConteo() {
  app.querySelectorAll('[data-action=tap]').forEach((btn) => {
    btn.addEventListener('click', () => registrarTap(btn.dataset.tipo, btn.dataset.valor ? Number(btn.dataset.valor) : undefined));
  });
  app.querySelector('[data-action=toggle-ra]')?.addEventListener('click', () => {
    estado.raActiva = !estado.raActiva;
    notificar();
  });
  app.querySelector('[data-action=deshacer]')?.addEventListener('click', () => deshacerUltimo());
  app.querySelector('[data-action=reset]')?.addEventListener('click', async () => {
    if (!confirm('¿Borrar todos los conteos de esta noche?')) return;
    if (!confirm('Confirmá de nuevo: esto no se puede deshacer.')) return;
    await resetearTurno();
  });
  app.querySelector('[data-action=cerrar-turno]')?.addEventListener('click', () => {
    // El cierre pasa primero por el arqueo de caja (paso deliberado, reemplaza el confirm).
    estado.vista = 'cerrar-caja';
    render();
  });
  app.querySelector('[data-action=cancelar-apertura]')?.addEventListener('click', async () => {
    if (!confirm('¿Volver esta noche a la agenda? Se cancela la apertura (portero y valor del ticket). Si ya contaste ingresos, quedan guardados en la noche.')) return;
    try {
      await cancelarApertura(estado.turno.id_turno);
      await entrarPostLogin(); // vuelve a la selección de noche (ya sin turno activo)
    } catch (err) {
      alert('No se pudo volver a la agenda — revisá la conexión e intentá de nuevo.');
    }
  });
  app.querySelector('[data-action=refrescar-lista]')?.addEventListener('click', async () => {
    await refrescarLista();
  });
  app.querySelector('[data-action=editar-fecha]')?.addEventListener('click', () => {
    editandoCampo = 'fecha';
    render();
    document.getElementById('edit-fecha')?.addEventListener('change', async (e) => {
      await editarTurno({ fecha: e.target.value });
      editandoCampo = null;
      render();
    });
  });
  app.querySelector('[data-action=editar-productora]')?.addEventListener('click', () => {
    editandoCampo = 'productora';
    render();
    document.getElementById('edit-productora')?.addEventListener('change', async (e) => {
      await editarTurno({ id_productora: e.target.value });
      editandoCampo = null;
      render();
    });
  });

  const input = document.getElementById('buscador');
  let debounce;
  input?.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => renderResultadosBuscador(input.value), 150);
  });

  app.querySelector('[data-action=focus-buscador]')?.addEventListener('click', () => {
    document.getElementById('buscador')?.focus();
  });

  app.querySelector('[data-action=abrir-free303]')?.addEventListener('click', () => {
    modalFree303 = { cantidad: 1, idOrganizador: estado.organizadoresPuerta[0]?.id_organizador ?? null };
    render();
  });
  app.querySelector('[data-action=cerrar-modal]')?.addEventListener('click', () => { modalFree303 = null; render(); });
  app.querySelector('[data-action=cerrar-modal-fondo]')?.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'cerrar-modal-fondo') { modalFree303 = null; render(); }
  });
  app.querySelector('[data-action=free303-menos]')?.addEventListener('click', () => {
    modalFree303.cantidad = Math.max(1, modalFree303.cantidad - 1);
    render();
  });
  app.querySelector('[data-action=free303-mas]')?.addEventListener('click', () => {
    modalFree303.cantidad += 1;
    render();
  });
  app.querySelector('[data-action=confirmar-free303]')?.addEventListener('click', async () => {
    const sel = document.getElementById('free303-organizador');
    const idOrganizador = sel?.value;
    if (!idOrganizador) return;
    const cantidad = modalFree303.cantidad;
    modalFree303 = null;
    await registrarFree303(cantidad, idOrganizador);
    render();
  });
}

function renderResultadosBuscador(query) {
  const cont = document.getElementById('lz-res');
  if (!cont) return;
  const resultados = buscar(query);
  cont.innerHTML = resultados
    .map((r) =>
      r.entro
        ? `<div class="lzr us"><span class="nm">${r.nombre}</span><span class="tg">ingresó ${new Date(r.hora_entro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span></div>`
        : `<div class="lzr av" data-id="${r.id_lista}"><span class="nm">${r.nombre}</span><span class="tg">tocar ✓</span></div>`
    )
    .join('');
  cont.querySelectorAll('.lzr.av').forEach((el) => {
    el.addEventListener('click', async () => {
      const fila = estado.listaCache.find((l) => l.id_lista === el.dataset.id);
      const resultado = await marcarEntrada(fila);
      if (!resultado.ok && resultado.motivo === 'sin-conexion') {
        alert('Sin conexión: no se pudo validar en la lista. Probá de nuevo en un momento.');
      }
      document.getElementById('buscador').value = '';
      cont.innerHTML = '';
    });
  });
}

// Arqueo de caja antes de cerrar: el portero cuenta el efectivo y el sistema
// calcula la varianza (contado − fondo − esperado). Esperado = efectivo a rendir
// (estado.caja: tickets no-RA + guardarropa, sin RA).
function renderCerrarCaja() {
  const esperado = estado.caja;
  const fondoDefault = Number(estado.turno.fondo_caja ?? 250);
  app.innerHTML = `
    <div class="abrir">
      <div class="abrir-t">Cerrar caja</div>
      <div class="abrir-sub">Contá el efectivo de la caja antes de cerrar el turno.</div>
      <form id="f-arqueo">
        <div class="arq-esp"><span>Efectivo esperado</span><b>€${esperado.toFixed(0)}</b></div>
        <label>Fondo inicial (con cuánto arrancó la caja)
          <input name="fondo" type="number" min="0" step="1" value="${fondoDefault}" />
        </label>
        <label>Efectivo contado ahora
          <input name="contado" type="number" min="0" step="1" required placeholder="contá la caja" inputmode="numeric" />
        </label>
        <div class="arq-var" id="arq-var">Varianza: —</div>
        <button type="submit">Cerrar turno</button>
        <button type="button" class="link-crear" id="btn-cancelar-cierre">← Volver a contar</button>
      </form>
    </div>`;

  const form = document.getElementById('f-arqueo');
  const varEl = document.getElementById('arq-var');
  const recalc = () => {
    const fondo = Number(form.fondo.value || 0);
    if (form.contado.value === '') { varEl.textContent = 'Varianza: —'; varEl.className = 'arq-var'; return; }
    const v = Number(form.contado.value) - fondo - esperado;
    varEl.textContent = `Varianza: ${v < 0 ? '−€' + Math.abs(v).toFixed(0) : '€' + v.toFixed(0)}`;
    varEl.className = 'arq-var ' + (v < 0 ? 'neg' : 'ok');
  };
  form.fondo.addEventListener('input', recalc);
  form.contado.addEventListener('input', recalc);
  document.getElementById('btn-cancelar-cierre').addEventListener('click', () => { estado.vista = 'conteo'; render(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await cerrarTurno({ fondo_caja: Number(form.fondo.value || 0), efectivo_contado: Number(form.contado.value) });
      desglosecierre = await calcularDesgloseCierre(estado.turno.id_turno);
      estado.vista = 'cierre';
      render();
    } catch (err) {
      alert('No se pudo cerrar el turno — revisá la conexión e intentá de nuevo.');
    }
  });
}

function renderCierre() {
  const t = estado.turno;
  const d = desglosecierre;
  const contado = t.efectivo_contado == null ? null : Number(t.efectivo_contado);
  const variance = contado == null ? null : contado - Number(t.fondo_caja ?? 0) - d.caja;
  app.innerHTML = `
    <div class="cl-sum">
      <div class="sum-hdr">
        <div class="sum-check">✓</div>
        <div class="sum-t">Turno cerrado</div>
        <div class="sum-meta">303 · ${t.clientes?.nombre ?? ''} · ${t.fecha} · ${t.productoras?.nombre ?? ''} · ${t.portero}</div>
      </div>
      <div class="caja">
        <div class="caja-l">Efectivo a rendir</div>
        <div class="caja-v">€${d.caja.toFixed(0)}</div>
        <div class="caja-break">
          <div class="cbk"><span class="k">Tickets puerta · ${d.ticketsCaja} × ${t.valor_ticket}€</span><span class="v">€${(d.ticketsCaja * t.valor_ticket).toFixed(0)}</span></div>
          <div class="cbk"><span class="k">Guardarropa · ${d.guardarropa} × 2€</span><span class="v">€${(d.guardarropa * 2).toFixed(0)}</span></div>
        </div>
      </div>
      ${variance == null ? '' : `
      <div class="varc ${variance < 0 ? 'neg' : 'ok'}">
        <div><div class="varc-l">Varianza de caja</div><div class="varc-s">contado €${contado.toFixed(0)} − fondo €${Number(t.fondo_caja ?? 0).toFixed(0)} − esperado €${d.caja.toFixed(0)}</div></div>
        <div class="varc-v">${variance < 0 ? '−€' + Math.abs(variance).toFixed(0) : '€' + variance.toFixed(0)}</div>
      </div>`}
      <div class="ra-card">
        <div><div class="ra-cl">Cobrado por RA</div><div class="ra-cs">${d.ticketsRa} ticket${d.ticketsRa === 1 ? '' : 's'} · pago externo</div></div>
        <div class="ra-cv">€${d.cobradoRa.toFixed(0)}</div>
      </div>
      <div class="tot-c">
        <div class="tot-top"><span class="tot-l">Total de la noche</span><span class="tot-badge">se exporta</span></div>
        <div class="tot-grid">
          <div class="tot-i"><div class="n">${d.personas}</div><div class="k">personas</div></div>
          <div class="tot-i"><div class="n">€${(d.caja + d.cobradoRa).toFixed(0)}</div><div class="k">ingresos totales</div></div>
        </div>
      </div>
      <button class="fin-btn" id="btn-finalizar">Finalizar</button>
    </div>`;

  document.getElementById('btn-finalizar').addEventListener('click', () => entrarPostLogin());
}

iniciar();
