// Formulario público de lista — sin login. El organizador entra al link,
// elige la noche y su nombre, pone su PIN y pega los nombres.

import { nightsParaLista, organizadoresParaLista, cargarLista } from './data.js';
import { APP_VERSION } from '../shared/config.js';

const BACK_LINK = '<a href="../" style="display:inline-flex;align-items:center;gap:5px;color:#c0b8d0;text-decoration:none;background:#16161f;border:1px solid #26262f;border-radius:9px;padding:7px 11px;font-size:12px;margin-bottom:14px">← Menú</a>';
const VERSION_STAMP = `<div style="text-align:center;margin-top:16px;font-size:10px;color:#6a6478;font-family:ui-monospace,Consolas,monospace">${APP_VERSION}</div>`;

const app = document.getElementById('app');

const vista = {
  noches: [],
  organizadores: [],
  idClienteActual: null,
};

async function iniciar() {
  try {
    vista.noches = await nightsParaLista();
    if (vista.noches.length === 0) {
      app.innerHTML = `<div class="vacio">${BACK_LINK}<br>No hay noches agendadas para cargar lista.<br>Pedile al admin que agende la noche primero.</div>`;
      return;
    }
    await cargarOrganizadoresDe(vista.noches[0].id_cliente);
    renderForm();
  } catch (err) {
    app.innerHTML = `<div class="vacio">Algo falló al cargar: ${err.message ?? err}. Recargá la página.</div>`;
  }
}

async function cargarOrganizadoresDe(idCliente) {
  vista.idClienteActual = idCliente;
  vista.organizadores = await organizadoresParaLista(idCliente);
}

function renderForm() {
  const opcionesNoches = vista.noches
    .map((n) => `<option value="${n.id_turno}" data-cliente="${n.id_cliente}">${n.fecha} · ${n.productora} · ${n.cliente}${n.estado === 'activo' ? ' (en curso)' : ''}</option>`)
    .join('');
  const opcionesOrg = vista.organizadores
    .map((o) => `<option value="${o.id_organizador}">${o.nombre}</option>`)
    .join('');

  app.innerHTML = `
    <div style="padding:16px 20px 0">${BACK_LINK}</div>
    <div class="form-wrap">
      <div class="hdr"><div class="hdr-t">Cargar lista de invitados</div></div>
      <form id="f-lista">
        <label>Noche
          <select name="id_turno" required>${opcionesNoches}</select>
        </label>
        <div class="fila">
          <label>Tu nombre
            <select name="id_organizador" required>${opcionesOrg}</select>
          </label>
          <label class="pin-lbl">Tu PIN
            <input name="pin" inputmode="numeric" pattern="[0-9]*" required placeholder="••••" />
          </label>
        </div>
        <label>Nombres (uno por línea)
          <textarea name="nombres" rows="9" required placeholder="Martín Gómez&#10;María Álvarez&#10;..."></textarea>
        </label>
        <button type="submit">Cargar nombres</button>
        <div class="msg" id="msg"></div>
      </form>
      ${VERSION_STAMP}
    </div>`;

  const selNoche = document.querySelector('select[name=id_turno]');
  selNoche.addEventListener('change', async () => {
    // Al cambiar de noche puede cambiar el cliente -> recargar organizadores.
    const idCliente = selNoche.selectedOptions[0].dataset.cliente;
    if (idCliente !== vista.idClienteActual) {
      await cargarOrganizadoresDe(idCliente);
      const selOrg = document.querySelector('select[name=id_organizador]');
      selOrg.innerHTML = vista.organizadores.map((o) => `<option value="${o.id_organizador}">${o.nombre}</option>`).join('');
    }
  });

  document.getElementById('f-lista').addEventListener('submit', manejarEnvio);
}

async function manejarEnvio(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const msg = document.getElementById('msg');
  msg.className = 'msg';
  msg.textContent = '';

  // Un nombre por línea; se ignoran vacíos y duplicados exactos dentro del pegado.
  const nombres = [...new Set(f.get('nombres').split('\n').map((n) => n.trim()).filter(Boolean))];
  if (nombres.length === 0) {
    msg.classList.add('err');
    msg.textContent = 'No hay nombres para cargar.';
    return;
  }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const total = await cargarLista(f.get('id_turno'), f.get('id_organizador'), String(f.get('pin')).trim(), nombres);
    msg.classList.add('ok');
    msg.textContent = `✓ ${nombres.length} cargado${nombres.length === 1 ? '' : 's'}. La noche tiene ${total} nombre${total === 1 ? '' : 's'} en total.`;
    e.target.querySelector('textarea[name=nombres]').value = '';
  } catch (err) {
    msg.classList.add('err');
    // El PIN inválido llega como excepción del servidor.
    msg.textContent = /pin/i.test(err.message ?? '') ? 'PIN incorrecto para ese organizador.' : ('No se pudo cargar: ' + (err.message ?? err));
  } finally {
    btn.disabled = false;
  }
}

iniciar();
