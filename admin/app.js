import { supabase } from '../shared/supabaseClient.js';
import { APP_VERSION } from '../shared/config.js';
import {
  listarClientes,
  listarProductoras,
  crearProductora,
  setActivoProductora,
  listarOrganizadores,
  crearOrganizador,
  setActivoOrganizador,
  listarTurnosConTotales,
  crearTurnoProgramado,
  eliminarTurno,
  actualizarAcuerdoProductora,
  actualizarBarraRevenue,
} from './data.js';

const app = document.getElementById('app');

const vista = {
  clientes: [],
  idCliente: null,
  productoras: [],
  organizadores: [],
  turnos: [],
  turnoMes: null,     // 'YYYY-MM' | 'all' | null (null = default al mes más reciente)
  turnoProd: 'all',   // nombre de productora | 'all'
};

async function iniciar() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return renderLogin();
  // Puede haber una sesión de otra app (portero/organizador) persistida en este
  // navegador. Si no es admin, ofrecer cerrar sesión en vez de un callejón sin salida.
  const { data: esAdmin } = await supabase.rpc('is_admin');
  if (!esAdmin) return renderNoAdmin();
  await cargarTodo();
}

function renderNoAdmin() {
  app.innerHTML = `
    <div class="login">
      <div class="login-t">Esta sesión no es de administrador</div>
      <p class="no-admin-msg">Hay una sesión iniciada que no tiene rol admin (probablemente quedó de otra app en este navegador). Cerrá sesión y entrá con tu cuenta de admin.</p>
      <button id="btn-relogin">Cerrar sesión</button>
      <a href="../puerta/" style="margin-top:14px;display:inline-block;color:#c0b8d0;text-decoration:none;background:#16161f;border:1px solid #26262f;border-radius:9px;padding:8px 12px;font-size:12px">¿Sos el portero? Andá a la app de puerta →</a>
    </div>`;
  document.getElementById('btn-relogin').addEventListener('click', async () => {
    await supabase.auth.signOut();
    renderLogin();
  });
}

function renderLogin() {
  app.innerHTML = `
    <div class="login">
      <div class="login-t">303 · panel admin</div>
      <form id="f-login">
        <input name="email" type="email" placeholder="email admin" required autocomplete="username" />
        <input name="pass" type="password" placeholder="contraseña" required autocomplete="current-password" />
        <button type="submit">Entrar</button>
        <div class="err" id="login-err"></div>
      </form>
    </div>`;
  document.getElementById('f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await supabase.auth.signInWithPassword({ email: f.get('email'), password: f.get('pass') });
    if (error) {
      document.getElementById('login-err').textContent = 'Credenciales incorrectas.';
      return;
    }
    await iniciar(); // vuelve a chequear rol admin antes de entrar
  });
}

async function cargarTodo() {
  vista.clientes = await listarClientes();
  if (vista.clientes.length === 0) {
    app.innerHTML = `<div class="vacio">No hay clientes cargados. Creá uno en la base antes de usar el panel.</div>`;
    return;
  }
  if (!vista.idCliente || !vista.clientes.some((c) => c.id_cliente === vista.idCliente)) {
    vista.idCliente = vista.clientes[0].id_cliente;
  }
  await cargarDatosCliente();
}

async function cargarDatosCliente() {
  [vista.productoras, vista.organizadores, vista.turnos] = await Promise.all([
    listarProductoras(vista.idCliente),
    listarOrganizadores(vista.idCliente),
    listarTurnosConTotales(vista.idCliente),
  ]);
  render();
}

function render() {
  const opcionesClientes = vista.clientes
    .map((c) => `<option value="${c.id_cliente}" ${c.id_cliente === vista.idCliente ? 'selected' : ''}>${c.nombre}</option>`)
    .join('');

  app.innerHTML = `
    <header class="top">
      <div style="display:flex;align-items:center;gap:12px">
        <a href="../" style="display:inline-flex;align-items:center;gap:5px;color:#c0b8d0;text-decoration:none;background:#16161f;border:1px solid #26262f;border-radius:9px;padding:7px 11px;font-size:12px">← Menú</a>
        <div class="brand">303 · <span>admin</span></div>
      </div>
      <div class="top-right">
        <span style="font-size:10px;color:#6a6478;font-family:ui-monospace,Consolas,monospace">${APP_VERSION}</span>
        <select id="sel-cliente" class="sel-cliente">${opcionesClientes}</select>
        <button id="btn-logout" class="btn-logout">Salir</button>
      </div>
    </header>
    <main class="wrap">
      ${seccionTurnos()}
      ${seccionAgenda()}
      ${seccionProductoras()}
      ${seccionOrganizadores()}
    </main>`;

  cablear();
}

function fechaLocalHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seccionAgenda() {
  const programadas = vista.turnos.filter((t) => t.estado === 'programado');
  const activas = vista.productoras.filter((p) => p.activo);
  const opcionesProd = activas.map((p) => `<option value="${p.id_productora}">${p.nombre}</option>`).join('');

  const filas = programadas
    .map(
      (t) => `
      <div class="row">
        <span class="row-nombre">${t.fecha}</span>
        <span class="row-meta">${t.productoras?.nombre ?? ''} · <b>${t.nombresEnLista}</b> en lista</span>
        <button class="row-toggle" data-cancelar="${t.id_turno}">Cancelar</button>
      </div>`
    )
    .join('');

  return `
    <details class="card">
      <summary><h2>Agenda</h2><span class="count">${programadas.length}</span><span class="chev">▶</span></summary>
      <div class="card-body">
        <p class="hint">Agendá las noches por adelantado. El organizador carga la lista contra una noche agendada, y el portero la activa al llegar.</p>
        <div class="rows">${filas || '<div class="row-vacia">Ninguna noche agendada.</div>'}</div>
        <form class="alta alta-agenda" id="f-agenda" ${activas.length ? '' : 'style="opacity:.5;pointer-events:none"'}>
          <select name="id_productora" required>${opcionesProd}</select>
          <input name="fecha" type="date" required value="${fechaLocalHoy()}" />
          <button type="submit">Agendar noche</button>
        </form>
        ${activas.length ? '' : '<p class="hint">Cargá al menos una productora activa para poder agendar.</p>'}
      </div>
    </details>`;
}

function seccionProductoras() {
  const filas = vista.productoras
    .map(
      (p) => `
      <div class="row ${p.activo ? '' : 'inactivo'}">
        <span class="row-nombre">${p.nombre}</span>
        <span class="row-meta">${p.activo ? '' : 'inactiva'}</span>
        <form class="pct-form" data-tipo="acuerdo" data-id="${p.id_productora}">
          <input type="number" name="pct_puerta" value="${p.pct_puerta ?? 20}" min="0" max="100" step="1" title="% de puerta para la productora">
          <span class="pct-suffix">% puerta</span>
          <input type="number" name="pct_barra" value="${p.pct_barra ?? 30}" min="0" max="100" step="1" title="% de barra para la productora">
          <span class="pct-suffix">% barra</span>
          <button type="submit">Guardar</button>
        </form>
        <button class="row-toggle" data-tipo="productora" data-id="${p.id_productora}" data-activo="${p.activo}">
          ${p.activo ? 'Dar de baja' : 'Reactivar'}
        </button>
      </div>`
    )
    .join('');
  return `
    <details class="card">
      <summary><h2>Productoras</h2><span class="count">${vista.productoras.length}</span><span class="chev">▶</span></summary>
      <div class="card-body">
        <p class="hint">Las que aparecen en el desplegable al abrir turno. % puerta/barra es lo que el venue le paga a esa productora (default 20/30) — se usa para "net to venue" en el dashboard. Dar de baja las oculta sin borrar su histórico.</p>
        <div class="rows">${filas || '<div class="row-vacia">Ninguna todavía.</div>'}</div>
        <form class="alta" data-tipo="productora">
          <input name="nombre" placeholder="Nombre de la productora" required />
          <button type="submit">Agregar</button>
        </form>
      </div>
    </details>`;
}

function seccionOrganizadores() {
  const filas = vista.organizadores
    .map(
      (o) => `
      <div class="row ${o.activo ? '' : 'inactivo'}">
        <span class="row-nombre">${o.nombre}</span>
        <span class="row-meta">PIN ${o.pin}${o.activo ? '' : ' · inactivo'}</span>
        <button class="row-toggle" data-tipo="organizador" data-id="${o.id_organizador}" data-activo="${o.activo}">
          ${o.activo ? 'Dar de baja' : 'Reactivar'}
        </button>
      </div>`
    )
    .join('');
  return `
    <details class="card">
      <summary><h2>Organizadores</h2><span class="count">${vista.organizadores.length}</span><span class="chev">▶</span></summary>
      <div class="card-body">
        <p class="hint">Cargan la lista de invitados. El PIN es identificación, no seguridad.</p>
        <div class="rows">${filas || '<div class="row-vacia">Ninguno todavía.</div>'}</div>
        <form class="alta alta-org" data-tipo="organizador">
          <input name="nombre" placeholder="Nombre" required />
          <input name="pin" placeholder="PIN" required inputmode="numeric" pattern="[0-9]*" />
          <button type="submit">Agregar</button>
        </form>
      </div>
    </details>`;
}

// YYYY-MM -> "julio de 2026" (admin va en español).
function mesLabel(clave) {
  const [y, m] = clave.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

function filaTurno(t) {
  const tot = t.totales;
  const total = tot.caja + tot.cobradoRa;
  const ticketMedio = tot.personas ? (total / tot.personas).toFixed(2) : '—';
  return `
    <tr class="${t.estado === 'activo' ? 'abierto' : ''}">
      <td>${t.fecha}</td>
      <td>${t.productoras?.nombre ?? ''}</td>
      <td>${t.portero}</td>
      <td class="num">${tot.personas}</td>
      <td class="num sub">${tot.free}</td>
      <td class="num sub">${tot.cash}</td>
      <td class="num sub">${tot.ra}</td>
      <td class="num">€${tot.caja.toFixed(0)}</td>
      <td class="num">€${tot.cobradoRa.toFixed(0)}</td>
      <td class="num">€${ticketMedio}</td>
      <td>
        ${t.estado === 'cerrado' ? `
          <form class="barra-form" data-id="${t.id_turno}">
            <input type="number" name="barra_revenue" value="${t.barra_revenue ?? 0}" min="0" step="1" title="Total de barra de esa noche">
            <button type="submit">💾</button>
          </form>` : '—'}
      </td>
      <td>${t.estado === 'cerrado' ? '<span class="cerrado">cerrado</span>' : '<span class="en-curso">en curso</span>'}</td>
    </tr>`;
}

// Aplica los filtros de mes/productora guardados en `vista`.
function turnosFiltrados(historicos) {
  return historicos.filter((t) => {
    const mesOk = vista.turnoMes === 'all' || t.fecha.startsWith(vista.turnoMes);
    const prodOk = vista.turnoProd === 'all' || (t.productoras?.nombre ?? '') === vista.turnoProd;
    return mesOk && prodOk;
  });
}

function resumenTurnos(filtrados) {
  const personas = filtrados.reduce((s, t) => s + t.totales.personas, 0);
  const caja = filtrados.reduce((s, t) => s + t.totales.caja + t.totales.cobradoRa, 0);
  const barra = filtrados.reduce((s, t) => s + Number(t.barra_revenue ?? 0), 0);
  const n = filtrados.length;
  return `${n} noche${n === 1 ? '' : 's'} · ${personas} personas · Caja €${caja.toFixed(0)} · Barra €${barra.toFixed(0)}`;
}

function seccionTurnos() {
  // Las noches 'programado' viven en la Agenda; acá solo el histórico operado.
  const historicos = vista.turnos.filter((t) => t.estado !== 'programado');
  if (historicos.length === 0) {
    return `<details class="card"><summary><h2>Turnos</h2><span class="count">0</span><span class="chev">▶</span></summary>
      <div class="card-body"><div class="row-vacia">Sin turnos operados para este cliente.</div></div></details>`;
  }

  // Meses y productoras presentes en el histórico, para los filtros.
  const meses = [...new Set(historicos.map((t) => t.fecha.slice(0, 7)))].sort().reverse();
  const prods = [...new Set(historicos.map((t) => t.productoras?.nombre ?? ''))].sort();
  // Default: mes más reciente con datos. Reset si el filtro guardado ya no aplica
  // (ej. se cambió de cliente y ese mes/productora no existe).
  if (vista.turnoMes === null || (vista.turnoMes !== 'all' && !meses.includes(vista.turnoMes))) vista.turnoMes = meses[0];
  if (vista.turnoProd !== 'all' && !prods.includes(vista.turnoProd)) vista.turnoProd = 'all';

  const opcMeses = `<option value="all" ${vista.turnoMes === 'all' ? 'selected' : ''}>Todos los meses</option>` +
    meses.map((m) => `<option value="${m}" ${m === vista.turnoMes ? 'selected' : ''}>${mesLabel(m)}</option>`).join('');
  const opcProds = `<option value="all" ${vista.turnoProd === 'all' ? 'selected' : ''}>Todas las productoras</option>` +
    prods.map((p) => `<option value="${p}" ${p === vista.turnoProd ? 'selected' : ''}>${p}</option>`).join('');

  const filtrados = turnosFiltrados(historicos);
  const filas = filtrados.length
    ? filtrados.map(filaTurno).join('')
    : '<tr><td colspan="12" class="row-vacia">Sin turnos para este filtro.</td></tr>';

  return `
    <details class="card">
      <summary><h2>Turnos</h2><span class="count">${historicos.length}</span><span class="chev">▶</span></summary>
      <div class="card-body">
        <p class="hint">Personas desglosadas en free / cash / RA. Ticket medio = (caja + RA) ÷ personas. Barra es carga manual (placeholder hasta tener un import real de Revolut) — el dashboard ya la usa para Bar y "net to venue".</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#8a8a98">Mes <select id="turno-filtro-mes" class="sel-cliente">${opcMeses}</select></label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#8a8a98">Productora <select id="turno-filtro-prod" class="sel-cliente">${opcProds}</select></label>
        </div>
        <div style="font-size:12px;color:#b8b4c8;margin-bottom:10px;font-weight:600">${resumenTurnos(filtrados)}</div>
        <div class="tabla-scroll">
          <table class="turnos">
            <thead><tr>
              <th>Fecha</th><th>Productora</th><th>Portero</th>
              <th class="num">Pers.</th><th class="num sub">Free</th><th class="num sub">Cash</th><th class="num sub">RA</th>
              <th class="num">Caja</th><th class="num">RA €</th><th class="num">Ticket med.</th><th>Barra</th><th>Estado</th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>
    </details>`;
}

function cablear() {
  document.getElementById('sel-cliente').addEventListener('change', async (e) => {
    vista.idCliente = e.target.value;
    await cargarDatosCliente();
  });
  document.getElementById('turno-filtro-mes')?.addEventListener('change', (e) => {
    vista.turnoMes = e.target.value;
    render();
  });
  document.getElementById('turno-filtro-prod')?.addEventListener('change', (e) => {
    vista.turnoProd = e.target.value;
    render();
  });
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    renderLogin();
  });

  app.querySelectorAll('form.alta[data-tipo]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      try {
        if (form.dataset.tipo === 'productora') {
          await crearProductora(vista.idCliente, f.get('nombre').trim());
        } else {
          await crearOrganizador(vista.idCliente, f.get('nombre').trim(), f.get('pin').trim());
        }
        await cargarDatosCliente();
      } catch (err) {
        alert('No se pudo agregar: ' + (err.message ?? err));
      }
    });
  });

  document.getElementById('f-agenda')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await crearTurnoProgramado(vista.idCliente, f.get('id_productora'), f.get('fecha'));
      await cargarDatosCliente();
    } catch (err) {
      alert('No se pudo agendar: ' + (err.message ?? err));
    }
  });

  app.querySelectorAll('[data-cancelar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Cancelar esta noche agendada?')) return;
      try {
        await eliminarTurno(btn.dataset.cancelar);
        await cargarDatosCliente();
      } catch (err) {
        alert('No se pudo cancelar: ' + (err.message ?? err));
      }
    });
  });

  app.querySelectorAll('.row-toggle').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const activo = btn.dataset.activo === 'true';
      try {
        if (btn.dataset.tipo === 'productora') {
          await setActivoProductora(btn.dataset.id, !activo);
        } else {
          await setActivoOrganizador(btn.dataset.id, !activo);
        }
        await cargarDatosCliente();
      } catch (err) {
        alert('No se pudo actualizar: ' + (err.message ?? err));
      }
    });
  });

  app.querySelectorAll('form.pct-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      try {
        await actualizarAcuerdoProductora(form.dataset.id, Number(f.get('pct_puerta')), Number(f.get('pct_barra')));
        await cargarDatosCliente();
      } catch (err) {
        alert('No se pudo guardar el acuerdo: ' + (err.message ?? err));
      }
    });
  });

  app.querySelectorAll('form.barra-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      try {
        await actualizarBarraRevenue(form.dataset.id, Number(f.get('barra_revenue')));
        await cargarDatosCliente();
      } catch (err) {
        alert('No se pudo guardar la barra: ' + (err.message ?? err));
      }
    });
  });
}

iniciar();
