/**
 * Adaptador para el proyecto administrativo de Apps Script.
 * accionFusaya autentica la sesión y limita las operaciones permitidas.
 */
function doPost(e) {
  const responder = (datos) => ContentService.createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);

  try {
    const cuerpo = e && e.postData && e.postData.contents;
    if (!cuerpo) return responder({ok: false, mensaje: 'Solicitud incompleta.'});

    const {sesion, accion, argumentos} = JSON.parse(cuerpo);
    if (typeof sesion !== 'string' || !sesion ||
        typeof accion !== 'string' || !/^admin_[a-zA-Z0-9]+$/.test(accion) ||
        !Array.isArray(argumentos)) {
      return responder({ok: false, mensaje: 'Solicitud inválida.'});
    }

    const datos = accionFusaya(sesion, accion, argumentos);
    return responder({ok: true, datos});
  } catch (error) {
    return responder({ok: false, mensaje: 'No se pudo completar la operación. Revisa tu sesión y los datos ingresados.'});
  }
}
