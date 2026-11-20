const button = document.querySelector('#install');
const status = document.querySelector('#status');
let installEvent;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installEvent = event;
  button.hidden = false;
});
button.addEventListener('click', async () => {
  if (!installEvent) return;
  const event = installEvent;
  installEvent = null;
  button.hidden = true;
  await event.prompt();
});
window.addEventListener('appinstalled', () => {
  button.hidden = true;
  status.textContent = 'FUSAYA Admin está instalada.';
});
function connectionStatus() {
  status.textContent = navigator.onLine ? '' : 'Conéctate a internet para abrir el panel con Google.';
}
window.addEventListener('online', connectionStatus);
window.addEventListener('offline', connectionStatus);
connectionStatus();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
