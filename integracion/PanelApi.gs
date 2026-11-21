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
