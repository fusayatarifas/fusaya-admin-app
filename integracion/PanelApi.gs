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

    const solicitud = JSON.parse(cuerpo);
    if (solicitud.tipo === 'interfaz') return responder({ok: true, datos: interfazApp_(solicitud.sesion)});
    if (solicitud.tipo === 'inicio') return responder({ok: true, datos: iniciarIngresoApp_()});
    if (solicitud.tipo === 'ingreso') {
      return responder({ok: true, datos: completarIngresoApp_(solicitud)});
    }
    const {sesion, accion, argumentos} = solicitud;
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

function iniciarIngresoApp_() {
  const oauth = credencialesGoogle_();
  if (!oauth) throw new Error('Google no está configurado.');

  const estado = claveAleatoria_();
  const verifier = claveAleatoria_();
  const challenge = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, verifier, Utilities.Charset.UTF_8)
  ).replace(/=+$/, '');
  CacheService.getScriptCache().put('oauth-app:' + estado, verifier, 300);
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + codificarConsulta_({
    client_id: oauth.id,
    redirect_uri: oauth.redirect,
    response_type: 'code',
    scope: 'openid email',
    state: estado,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return {url, estado};
}

function completarIngresoApp_({estado, codigo}) {
  const oauth = credencialesGoogle_();
  if (!oauth || typeof estado !== 'string' || !/^[a-f0-9]{64}$/i.test(estado) ||
      typeof codigo !== 'string' || !codigo || codigo.length > 4096) {
    throw new Error('Inicio de sesión inválido.');
  }

  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  let verifier;
  lock.waitLock(7000);
  try {
    const key = 'oauth-app:' + estado;
    verifier = cache.get(key);
    cache.remove(key);
  } finally {
    lock.releaseLock();
  }
  if (!verifier) throw new Error('Inicio de sesión vencido.');

  const respuesta = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      code: codigo,
      client_id: oauth.id,
      client_secret: oauth.secreto,
      redirect_uri: oauth.redirect,
      code_verifier: verifier,
      grant_type: 'authorization_code',
    },
  });
  const token = JSON.parse(respuesta.getContentText()).access_token;
  if (!token) throw new Error('Google no devolvió una sesión.');
  const identidad = UrlFetchApp.fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {Authorization: 'Bearer ' + token},
  });
  const datos = JSON.parse(identidad.getContentText());
  if (datos.email_verified !== true || !administradorApp_(datos.email)) {
    throw new Error('Cuenta sin acceso.');
  }
  const sesion = claveAleatoria_();
  cache.put('sesion:' + sesion, datos.email.toLowerCase(), 1800);
  return {sesion};
}

function interfazApp_(sesion) {
  if (typeof sesion !== 'string' || !/^[a-f0-9]{64}$/i.test(sesion)) {
    throw new Error('Sesión inválida.');
  }
  const email = CacheService.getScriptCache().get('sesion:' + sesion);
  if (!administradorApp_(email)) throw new Error('Cuenta sin acceso.');

  const origen = HtmlService.createHtmlOutputFromFile('PanelAdmin').getContent();
  const llamadas = /^function call\(fn,\.\.\.args\)\{[^\r\n]*\}$/m;
  const adjuntos = /^async function subirDocumento\(\)\{[^\r\n]*\}$/m;
  if (!llamadas.test(origen) || !adjuntos.test(origen)) {
    throw new Error('La versión del panel no admite esta conexión.');
  }
  const html = origen
    .replace(/^const sesionFusaya = [^\r\n]*\r?\n/m, '')
    .replace(llamadas, () => `async function call(fn, ...args) {
      try { return await window.fusayaPanel.ejecutar(fn, ...args); }
      catch (error) { toast(error.message, true); throw error; }
    }`)
    .replace(adjuntos, () => `async function subirDocumento() {
      const input = $('dArchivo');
      const mensaje = await window.fusayaPanel.subirDocumento({
        piloto: val('dPiloto'), tipo: val('dTipo'), vence: val('dVence'), archivo: input.files[0],
      });
      toast(mensaje);
      input.value = '';
      await load();
    }`);
  if (html.includes('google.script.run') || html.includes('<?') || html.includes('sesionFusaya')) {
    throw new Error('La plantilla conserva dependencias sin migrar.');
  }
  return {html};
}
