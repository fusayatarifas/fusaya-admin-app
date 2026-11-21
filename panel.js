import {crearTransportePanel} from './panel-api.js';
import {iniciarIngreso} from './panel-ingreso.js';
import {operacionesPanel} from './panel-operaciones.js';

const endpoint = 'https://script.google.com/macros/s/AKfycbySVKEV9v0jUR04OfkmzHX9dkNHvMMvGExC9E-1wODshGTAV45d6J0eip91NLJ0ntE_/exec';
const solicitar = crearTransportePanel(endpoint);
const clave = 'fusaya.panel.sesion';
const boton = document.querySelector('#ingresar');
const estado = document.querySelector('#estado');

boton.addEventListener('click', async () => {
  boton.disabled = true;
  try {
    await iniciarIngreso(solicitar);
  } catch (error) {
    estado.textContent = error.message;
    boton.disabled = false;
  }
});

async function cargarPanel(sesion) {
  boton.disabled = true;
  try {
    const {html} = await solicitar({tipo: 'interfaz', sesion});
    const plantilla = new DOMParser().parseFromString(html, 'text/html');
    const scripts = [...plantilla.querySelectorAll('script')];
    if (scripts.length !== 1 || scripts[0].hasAttribute('src')) {
      throw new Error('La plantilla del panel cambió.');
    }
    const codigo = scripts[0].textContent;
    scripts[0].remove();
    const {ejecutar, subirDocumento} = operacionesPanel(endpoint, sesion);
    window.fusayaPanel = Object.freeze({ejecutar, subirDocumento});
    document.title = 'FUSAYA · Administración';
    for (const estilo of plantilla.querySelectorAll('style')) document.head.append(estilo);
    document.body.replaceChildren(...plantilla.body.childNodes);
    const script = document.createElement('script');
    script.textContent = codigo;
    document.body.append(script);
  } catch (error) {
    sessionStorage.removeItem(clave);
    estado.textContent = error.message;
    boton.disabled = false;
  }
}

const sesion = sessionStorage.getItem(clave);
if (sesion) cargarPanel(sesion);
