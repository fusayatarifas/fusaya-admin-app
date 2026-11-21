export function conectarPanel(url, sesion) {
  const endpoint = new URL(url);
  if (endpoint.origin !== 'https://script.google.com' ||
      !/^\/macros\/s\/[\w-]+\/exec$/.test(endpoint.pathname) ||
      endpoint.search || endpoint.hash || endpoint.username || endpoint.password) {
    throw new Error('La dirección del panel no es válida.');
  }
  if (typeof sesion !== 'string' || !sesion) {
    throw new Error('Inicia sesión con tu cuenta de administrador.');
  }

  return async function ejecutar(accion, ...argumentos) {
    const respuesta = await fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: {'Content-Type': 'text/plain;charset=UTF-8'},
      body: JSON.stringify({sesion, accion, argumentos}),
    });
    if (!respuesta.ok || !respuesta.headers.get('content-type')?.includes('application/json')) {
      throw new Error('No se pudo confirmar la operación. Consulta el panel antes de repetirla.');
    }
    const resultado = await respuesta.json();
    if (resultado.ok !== true) {
      throw new Error(resultado.mensaje || 'No se pudo completar la operación.');
    }
    return resultado.datos;
  };
}
