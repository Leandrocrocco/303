import { supabase } from '../shared/supabaseClient.js';
import { APP_VERSION } from '../shared/config.js';
import { listarClientes, turnosCerradosConTotales } from './data.js';
import * as tabGeneral from './tabs/general.js';
import * as tabProducers from './tabs/producers.js';
import * as tabDoor from './tabs/door.js';
import * as tabBar from './tabs/bar.js';
import * as tabNights from './tabs/nights.js';

const TABS = [
  { id: 'general', label: 'General', mod: tabGeneral },
  { id: 'producers', label: 'Producers', mod: tabProducers },
  { id: 'door', label: 'Door', mod: tabDoor },
  { id: 'bar', label: 'Bar', mod: tabBar },
  { id: 'nights', label: 'Nights', mod: tabNights },
];

const app = document.getElementById('app');

const vista = {
  clientes: [],
  idCliente: null,
  tab: 'general',
  turnos: [],
};

async function iniciar() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return renderLogin();
  const { data: esAdmin } = await supabase.rpc('is_admin');
  if (!esAdmin) return renderNoAccess();
  await cargarTodo();
}

function renderLogin() {
  app.innerHTML = `
    <div class="login">
      <div class="login-t">303 · owner dashboard</div>
      <form id="f-login">
        <input name="email" type="email" placeholder="email" required autocomplete="username" />
        <input name="pass" type="password" placeholder="password" required autocomplete="current-password" />
        <button type="submit">Sign in</button>
        <div class="err" id="login-err"></div>
      </form>
    </div>`;
  document.getElementById('f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await supabase.auth.signInWithPassword({ email: f.get('email'), password: f.get('pass') });
    if (error) {
      document.getElementById('login-err').textContent = 'Incorrect credentials.';
      return;
    }
    await iniciar();
  });
}

function renderNoAccess() {
  app.innerHTML = `
    <div class="login">
      <div class="login-t">This session isn't authorized</div>
      <p class="no-admin-msg">The signed-in account doesn't have dashboard access. Sign out and use your owner account.</p>
      <button id="btn-relogin">Sign out</button>
      <a class="back-link" href="../puerta/" style="margin-top:14px">Door staff? Open the door app →</a>
    </div>`;
  document.getElementById('btn-relogin').addEventListener('click', async () => {
    await supabase.auth.signOut();
    renderLogin();
  });
}

async function cargarTodo() {
  vista.clientes = await listarClientes();
  if (vista.clientes.length === 0) {
    app.innerHTML = `<div class="vacio">No venues set up yet.</div>`;
    return;
  }
  if (!vista.idCliente || !vista.clientes.some((c) => c.id_cliente === vista.idCliente)) {
    vista.idCliente = vista.clientes[0].id_cliente;
  }
  await cargarDatosCliente();
}

async function cargarDatosCliente() {
  vista.turnos = await turnosCerradosConTotales(vista.idCliente);
  render();
}

function shellHTML() {
  const opcionesClientes = vista.clientes
    .map((c) => `<option value="${c.id_cliente}" ${c.id_cliente === vista.idCliente ? 'selected' : ''}>${c.nombre}</option>`)
    .join('');
  return `
    <header class="topbar">
      <a class="back-link" href="../">← Menu</a>
      <div>
        <div class="word">303<span class="dot">.</span></div>
        <div class="venue-sub">Owner dashboard</div>
      </div>
      <div class="top-spacer"></div>
      <span class="app-version">${APP_VERSION}</span>
      <select id="sel-cliente" class="sel-cliente">${opcionesClientes}</select>
      <button id="btn-logout" class="btn-logout">Sign out</button>
    </header>
    <div class="tabs" role="tablist">
      ${TABS.map((t) => `<button class="tab ${vista.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <main class="wrap" id="tab-root"></main>`;
}

function render() {
  app.innerHTML = shellHTML();
  document.getElementById('sel-cliente').addEventListener('change', async (e) => {
    vista.idCliente = e.target.value;
    await cargarDatosCliente();
  });
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    renderLogin();
  });
  app.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      vista.tab = btn.dataset.tab;
      render();
    });
  });
  renderTabContent();
}

function renderTabContent() {
  const activo = TABS.find((t) => t.id === vista.tab);
  const root = document.getElementById('tab-root');
  root.innerHTML = activo.mod.render(vista.turnos);
  activo.mod.wire(root, vista.turnos);
}

iniciar();
