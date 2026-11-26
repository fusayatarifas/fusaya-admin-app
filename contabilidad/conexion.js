async function request(action,payload,token){
 const endpoint=window.FUSAYA_ENDPOINT;
 if (!endpoint) throw Error('La conexión con la base privada está pendiente de activación.');
 const response=await fetch(endpoint,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action,payload,token})});
 const result=await response.json();
 if(!result.ok)throw Error(result.error||'No se pudo completar la operación.');
 return result.value;
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');