import {conectarPanel} from './panel-api.js';

export function operacionesPanel(endpoint, sesion) {
  const ejecutar = conectarPanel(endpoint, sesion);

  async function subirDocumento({piloto, tipo, vence, archivo}) {
    if (!(archivo instanceof File) || !archivo.size ||
        (archivo.type && archivo.type !== 'application/pdf')) {
      throw new Error('Selecciona un documento PDF.');
    }
    const cabecera = await archivo.slice(0, 5).text();
    if (cabecera !== '%PDF-') throw new Error('El archivo no es un PDF válido.');

    const base64 = await new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onerror = () => rechazar(new Error('No se pudo leer el PDF.'));
      lector.onload = () => resolver(String(lector.result).split(',', 2)[1]);
      lector.readAsDataURL(archivo);
    });
    return ejecutar('admin_subirDocumento', piloto, tipo, vence, {
      tipo: 'application/pdf',
      base64,
    });
  }

  return {ejecutar, subirDocumento};
}
