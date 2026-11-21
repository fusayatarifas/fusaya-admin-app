const claveEstado = 'fusaya.oauth.estado';

export async function iniciarIngreso(solicitar) {
  const {url, estado} = await solicitar({tipo: 'inicio'});
  const google = new URL(url);
  if (google.origin !== 'https://accounts.google.com' ||
      google.pathname !== '/o/oauth2/v2/auth' ||
      !/^[a-f0-9]{64}$/i.test(estado) ||
      google.searchParams.get('state') !== estado) {
    throw new Error('Google no devolvió un inicio válido.');
  }
  sessionStorage.setItem(claveEstado, estado);
  location.assign(google.href);
}

export async function completarIngreso(solicitar) {
  const consulta = new URLSearchParams(location.search);
  const estado = sessionStorage.getItem(claveEstado);
  sessionStorage.removeItem(claveEstado);
  history.replaceState(null, '', location.pathname);
  if (consulta.has('error') || !estado ||
      consulta.getAll('state').length !== 1 ||
      consulta.get('state') !== estado ||
      consulta.getAll('code').length !== 1 ||
      !consulta.get('code')) {
    throw new Error('No se pudo completar el ingreso. Vuelve a iniciar sesión.');
  }

  const {sesion} = await solicitar({tipo: 'ingreso', estado, codigo: consulta.get('code')});
  if (!/^[a-f0-9]{64}$/i.test(sesion)) {
    throw new Error('No se recibió una sesión válida.');
  }
  return sesion;
}
