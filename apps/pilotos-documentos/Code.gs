/** FUSAYA MOTOS | Pilotos y documentos | Backend Apps Script
 * Requiere OAuth ID token verificado con el cliente de Google configurado.
 * No expone las hojas ni los archivos de Drive al cliente web.
 */
const FUSAYA_DOCS = Object.freeze({
  OAUTH_CLIENT_ID: '888161699234-g9bu0ta2mkhjfr2endstuvt24cos42dl.apps.googleusercontent.com',
  TZ: 'America/Bogota',
  MAX_FILE_BYTES: 8 * 1024 * 1024,
  MIME: ['application/pdf', 'image/jpeg', 'image/png'],
  TABS: { PILOTS: 'Pilotos', DOCS: 'Documentos', ADMINS: 'Administradores', CONFIG: 'Configuracion', AUDIT: 'Auditoria' },
  DOCS: ['CEDULA_FRENTE', 'CEDULA_REVERSO', 'LICENCIA_FRENTE', 'LICENCIA_REVERSO', 'ANTECEDENTES_JUDICIALES', 'SOAT', 'TECNOMECANICA']
});

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('FUSAYA | Pilotos y documentos')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Verify Google Identity Services ID token and exact allowlist on every call. */
function api(action, payload, idToken) {
  const email = authorize_(idToken);
  payload = payload || {};
  switch (String(action || '')) {
    case 'init': return init_(email);
    case 'savePilot': return savePilot_(email, payload);
    case 'uploadDocument': return uploadDocument_(email, payload);
    case 'getDocument': return getDocument_(email, payload);
    case 'setExpiry': return setExpiry_(email, payload);
    case 'archivePilot': return archivePilot_(email, payload);
    default: throw new Error('Acción no reconocida.');
  }
}

function authorize_(idToken) {
  if (!idToken || String(idToken).length > 6000) throw new Error('Inicia sesión con una cuenta Google autorizada.');
  const cache = CacheService.getScriptCache();
  const key = 'idtok:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)).slice(0, 40);
  let verified = cache.get(key);
  if (!verified) {
    const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error('Google no pudo validar el inicio de sesión. Vuelve a ingresar.');
    const token = JSON.parse(response.getContentText());
    if (token.aud !== FUSAYA_DOCS.OAUTH_CLIENT_ID || token.email_verified !== 'true' || !token.email) throw new Error('La cuenta de Google no quedó verificada.');
    if (Number(token.exp || 0) * 1000 < Date.now()) throw new Error('La sesión de Google venció. Vuelve a ingresar.');
    verified = String(token.email).trim().toLowerCase();
    cache.put(key, verified, 300);
  }
  const allowed = readAdmins_();
  if (!allowed.has(verified)) throw new Error('Acceso denegado para ' + verified + '. Pide al administrador que autorice esta cuenta.');
  return verified;
}

function init_(email) {
  const pilots = rows_(FUSAYA_DOCS.TABS.PILOTS).filter(r => String(r.ESTADO || '').toUpperCase() !== 'INACTIVO').map(p => {
    const docs = rows_(FUSAYA_DOCS.TABS.DOCS).filter(d => d.CODIGO_PILOTO === p.CODIGO && d.VIGENTE === 'SI');
    return Object.assign({}, p, { documentos: docs.map(publicDoc_), resumen: documentSummary_(docs) });
  });
  const config = config_();
  return { email, pilotos: pilots, siguienteNumero: String(config.NEXT_NUMERO || '01').padStart(2, '0'), tipos: FUSAYA_DOCS.DOCS,
    vencimientos: pilots.flatMap(p => p.documentos.filter(d => d.fechaVencimiento).map(d => ({ codigo: p.CODIGO, alias: p.ALIAS, tipo: d.tipo, fecha: d.fechaVencimiento, estado: d.estado }))) };
}

function savePilot_(email, p) {
  const alias = clean_(p.alias, 40);
  const nombres = clean_(p.nombres, 80);
  const apellidos = clean_(p.apellidos, 80);
  if (!alias || !nombres || !apellidos) throw new Error('Completa alias, nombres y apellidos.');
  const phone = digits_(p.whatsapp, 15);
  const e1 = digits_(p.emergencia1Telefono, 15), e2 = digits_(p.emergencia2Telefono, 15);
  if (!phone || !clean_(p.emergencia1Nombre, 80) || !e1 || !clean_(p.emergencia2Nombre, 80) || !e2) throw new Error('Completa WhatsApp y los dos contactos de emergencia con nombre y teléfono.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const all = rows_(FUSAYA_DOCS.TABS.PILOTS);
    let row = null, code;
    if (p.codigo) {
      row = all.find(x => x.CODIGO === String(p.codigo));
      if (!row) throw new Error('No se encontró la ficha que intentas editar.');
      code = row.CODIGO;
    } else {
      const used = new Set(all.map(x => x.CODIGO));
      let number = Math.max(1, Number(config_().NEXT_NUMERO || 1));
      do { code = String(number).padStart(2, '0') + '_' + aliasCode_(alias); number++; } while (used.has(code));
      const cfg = config_(); setConfig_('NEXT_NUMERO', String(number).padStart(2, '0'));
      const folder = DriveApp.getFolderById(property_('PILOT_ROOT_FOLDER_ID')).createFolder(code);
      const newRow = { CODIGO: code, NUMERO: code.split('_')[0], ALIAS: alias, NOMBRES: nombres, APELLIDOS: apellidos, WHATSAPP: phone,
        EMERGENCIA_1_NOMBRE: clean_(p.emergencia1Nombre, 80), EMERGENCIA_1_TELEFONO: e1,
        EMERGENCIA_2_NOMBRE: clean_(p.emergencia2Nombre, 80), EMERGENCIA_2_TELEFONO: e2, ESTADO: 'ACTIVO',
        FECHA_INGRESO: dateIso_(p.fechaIngreso) || today_(), CARPETA_DRIVE_ID: folder.getId(), OBSERVACIONES: clean_(p.observaciones, 500), CREADO_POR: email, ACTUALIZADO_EN: now_() };
      append_(FUSAYA_DOCS.TABS.PILOTS, newRow); audit_(email, 'CREAR_PILOTO', code, 'Ficha creada');
      return { ok: true, codigo: code };
    }
    const sh = sheet_(FUSAYA_DOCS.TABS.PILOTS), headers = headers_(FUSAYA_DOCS.TABS.PILOTS), rowIndex = row._row;
    const values = { ALIAS: alias, NOMBRES: nombres, APELLIDOS: apellidos, WHATSAPP: phone, EMERGENCIA_1_NOMBRE: clean_(p.emergencia1Nombre, 80), EMERGENCIA_1_TELEFONO: e1,
      EMERGENCIA_2_NOMBRE: clean_(p.emergencia2Nombre, 80), EMERGENCIA_2_TELEFONO: e2, OBSERVACIONES: clean_(p.observaciones, 500), ACTUALIZADO_EN: now_() };
    headers.forEach((h,i) => { if (Object.prototype.hasOwnProperty.call(values,h)) sh.getRange(rowIndex,i+1).setValue(values[h]); });
    audit_(email, 'EDITAR_PILOTO', code, 'Ficha actualizada'); return { ok: true, codigo: code };
  } finally { lock.releaseLock(); }
}

function uploadDocument_(email, p) {
  const code = String(p.codigo || ''), type = String(p.tipo || '');
  if (!FUSAYA_DOCS.DOCS.includes(type)) throw new Error('Tipo de documento no permitido.');
  const pilot = rows_(FUSAYA_DOCS.TABS.PILOTS).find(x => x.CODIGO === code && String(x.ESTADO).toUpperCase() !== 'INACTIVO');
  if (!pilot) throw new Error('No se encontró un piloto activo para guardar el documento.');
  const mime = String(p.mimeType || '').toLowerCase(), data = String(p.data || '').replace(/^data:[^,]+,/, '');
  if (!FUSAYA_DOCS.MIME.includes(mime)) throw new Error('Solo se admiten PDF, JPG o PNG.');
  if (!data || data.length > Math.ceil(FUSAYA_DOCS.MAX_FILE_BYTES * 4 / 3) + 256) throw new Error('El archivo supera 8 MB. Reduce el tamaño o conviértelo a PDF comprimido.');
  const bytes = Utilities.base64Decode(data);
  if (bytes.length > FUSAYA_DOCS.MAX_FILE_BYTES) throw new Error('El archivo supera 8 MB.');
  const safeName = safeFilename_(p.fileName || (type + ext_(mime)));
  const folder = DriveApp.getFolderById(pilot.CARPETA_DRIVE_ID);
  const blob = Utilities.newBlob(bytes, mime, safeName);
  const file = folder.createFile(blob); // Folder remains private; no sharing is added.
  const expires = (type === 'SOAT' || type === 'TECNOMECANICA') ? dateIso_(p.fechaVencimiento) : '';
  if ((type === 'SOAT' || type === 'TECNOMECANICA') && !expires) { file.setTrashed(true); throw new Error('Indica la fecha de vencimiento del ' + type + '.'); }
  const docSheet = sheet_(FUSAYA_DOCS.TABS.DOCS), docHeaders = headers_(FUSAYA_DOCS.TABS.DOCS), activeCol = docHeaders.indexOf('VIGENTE') + 1;
  rows_(FUSAYA_DOCS.TABS.DOCS).filter(d => d.CODIGO_PILOTO === code && d.TIPO_DOCUMENTO === type && d.VIGENTE === 'SI')
    .forEach(d => docSheet.getRange(d._row, activeCol).setValue('NO'));
  append_(FUSAYA_DOCS.TABS.DOCS, { ID_DOCUMENTO: Utilities.getUuid(), CODIGO_PILOTO: code, TIPO_DOCUMENTO: type, NOMBRE_ARCHIVO: safeName,
    DRIVE_FILE_ID: file.getId(), MIME_TYPE: mime, FECHA_CARGA: now_(), FECHA_VENCIMIENTO: expires, VIGENTE: 'SI', SUBIDO_POR: email, OBSERVACIONES: '' });
  audit_(email, 'CARGAR_DOCUMENTO', code, type + ' | ' + safeName);
  return { ok: true, documento: { tipo: type, nombre: safeName, fechaVencimiento: expires, estado: expiryStatus_(expires) } };
}

function getDocument_(email, p) {
  const doc = rows_(FUSAYA_DOCS.TABS.DOCS).find(d => d.ID_DOCUMENTO === String(p.id || '') && d.VIGENTE === 'SI');
  if (!doc) throw new Error('Documento no encontrado o reemplazado.');
  if (!rows_(FUSAYA_DOCS.TABS.PILOTS).some(x => x.CODIGO === doc.CODIGO_PILOTO)) throw new Error('La ficha asociada no existe.');
  const file = DriveApp.getFileById(doc.DRIVE_FILE_ID), blob = file.getBlob();
  audit_(email, 'CONSULTAR_DOCUMENTO', doc.CODIGO_PILOTO, doc.TIPO_DOCUMENTO);
  return { name: file.getName(), mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function setExpiry_(email, p) {
  const doc = rows_(FUSAYA_DOCS.TABS.DOCS).find(d => d.ID_DOCUMENTO === String(p.id || '') && d.VIGENTE === 'SI');
  if (!doc || !['SOAT','TECNOMECANICA'].includes(doc.TIPO_DOCUMENTO)) throw new Error('Solo SOAT y tecnomecánica tienen vencimiento controlado.');
  const iso = dateIso_(p.fecha); if (!iso) throw new Error('Escribe una fecha válida.');
  const row = doc._row, sh = sheet_(FUSAYA_DOCS.TABS.DOCS), hs = headers_(FUSAYA_DOCS.TABS.DOCS);
  sh.getRange(row, hs.indexOf('FECHA_VENCIMIENTO')+1).setValue(iso); audit_(email, 'ACTUALIZAR_VENCIMIENTO', doc.CODIGO_PILOTO, doc.TIPO_DOCUMENTO + ' ' + iso); return { ok:true };
}

function archivePilot_(email, p) {
  const pilot = rows_(FUSAYA_DOCS.TABS.PILOTS).find(x => x.CODIGO === String(p.codigo || ''));
  if (!pilot) throw new Error('No se encontró la ficha.');
  const sh = sheet_(FUSAYA_DOCS.TABS.PILOTS), hs = headers_(FUSAYA_DOCS.TABS.PILOTS);
  sh.getRange(pilot._row, hs.indexOf('ESTADO')+1).setValue('INACTIVO');
  sh.getRange(pilot._row, hs.indexOf('ACTUALIZADO_EN')+1).setValue(now_()); audit_(email, 'ARCHIVAR_PILOTO', pilot.CODIGO, 'Ficha archivada; archivos conservados'); return { ok:true };
}

function publicDoc_(d) { return { id:d.ID_DOCUMENTO, tipo:d.TIPO_DOCUMENTO, nombre:d.NOMBRE_ARCHIVO, fechaCarga:String(d.FECHA_CARGA||''), fechaVencimiento:dateIso_(d.FECHA_VENCIMIENTO), estado:expiryStatus_(d.FECHA_VENCIMIENTO) }; }
function documentSummary_(docs) {
  const latest = {}; docs.filter(x=>x.VIGENTE==='SI').forEach(d => { latest[d.TIPO_DOCUMENTO]=d; });
  return FUSAYA_DOCS.DOCS.map(t=>({tipo:t,estado:latest[t] ? expiryStatus_(latest[t].FECHA_VENCIMIENTO) : 'FALTA',id:latest[t]&&latest[t].ID_DOCUMENTO||''}));
}
function expiryStatus_(d) { const iso=dateIso_(d); if(!iso)return 'VIGENTE'; const days=Math.floor((new Date(iso+'T12:00:00-05:00').getTime()-Date.now())/86400000); return days<0?'VENCIDO':days<=30?'POR_VENCER':'VIGENTE'; }
function readAdmins_() {
  const s=sheet_(FUSAYA_DOCS.TABS.ADMINS), h=headers_(FUSAYA_DOCS.TABS.ADMINS), vals=s.getDataRange().getDisplayValues(); const out=new Set();
  for(let i=1;i<vals.length;i++){const row={};h.forEach((x,j)=>row[x]=vals[i][j]); if(String(row.ESTADO).toUpperCase()==='ACTIVO' && row.EMAIL)out.add(String(row.EMAIL).trim().toLowerCase());}
  config_().ADMIN_EMAILS.split(/[;,\s]+/).filter(Boolean).forEach(x=>out.add(x.toLowerCase())); return out;
}
function rows_(name){const s=sheet_(name),v=s.getDataRange().getValues();if(v.length<2)return[];const h=v[0].map(String);return v.slice(1).map((r,i)=>{const o={_row:i+2};h.forEach((k,j)=>o[k]=r[j] instanceof Date?Utilities.formatDate(r[j],FUSAYA_DOCS.TZ,'yyyy-MM-dd'):r[j]);return o;}).filter(o=>h.some(k=>o[k]!==''&&o[k]!==null));}
function headers_(name){return sheet_(name).getRange(1,1,1,sheet_(name).getLastColumn()).getDisplayValues()[0].map(String);}
function property_(name){const v=PropertiesService.getScriptProperties().getProperty('FUSAYA_DOCS_'+name);if(!v)throw new Error('Falta configurar la propiedad privada FUSAYA_DOCS_'+name+'.');return v;}
function sheet_(name){const s=SpreadsheetApp.openById(property_('SPREADSHEET_ID')).getSheetByName(name);if(!s)throw new Error('Falta la pestaña '+name+'.');return s;}
function config_(){const v=sheet_(FUSAYA_DOCS.TABS.CONFIG).getDataRange().getDisplayValues(),o={};v.slice(1).forEach(r=>{if(r[0])o[r[0]]=r[1]||'';});return o;}
function setConfig_(key,val){const s=sheet_(FUSAYA_DOCS.TABS.CONFIG),v=s.getDataRange().getDisplayValues();for(let i=1;i<v.length;i++)if(v[i][0]===key){s.getRange(i+1,2).setValue(val);return;}s.appendRow([key,val,'']);}
function append_(name,obj){const hs=headers_(name);sheet_(name).appendRow(hs.map(h=>obj[h]===undefined?'':obj[h]));}
function audit_(email,action,ident,summary){append_(FUSAYA_DOCS.TABS.AUDIT,{FECHA:now_(),EMAIL:email,ACCION:action,ENTIDAD:'PILOTO/DOCUMENTO',IDENTIFICADOR:ident,RESUMEN:String(summary).slice(0,500)});}
function clean_(s,max){return String(s||'').replace(/[<>\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function digits_(s,max){return String(s||'').replace(/\D/g,'').slice(0,max);}
function aliasCode_(s){return clean_(s,40).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9-]+/g,'').slice(0,24)||'PILOTO';}
function safeFilename_(s){return clean_(s,120).replace(/[\\/:*?"<>|]/g,'_')||'documento';}
function ext_(m){return m==='application/pdf'?'.pdf':m==='image/png'?'.png':'.jpg';}
function dateIso_(v){if(!v)return'';if(v instanceof Date&&!isNaN(v))return Utilities.formatDate(v,FUSAYA_DOCS.TZ,'yyyy-MM-dd');const s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const d=new Date(s);return isNaN(d)?'':Utilities.formatDate(d,FUSAYA_DOCS.TZ,'yyyy-MM-dd');}
function now_(){return Utilities.formatDate(new Date(),FUSAYA_DOCS.TZ,"yyyy-MM-dd'T'HH:mm:ss");}
function today_(){return Utilities.formatDate(new Date(),FUSAYA_DOCS.TZ,'yyyy-MM-dd');}

/** Safe read-only deployment check: validates private sheet tabs and Drive root. */
function revisarConexion(){
  const ss=SpreadsheetApp.openById(property_('SPREADSHEET_ID'));
  const faltan=Object.values(FUSAYA_DOCS.TABS).filter(n=>!ss.getSheetByName(n));
  if(faltan.length)throw new Error('Faltan pestañas: '+faltan.join(', '));
  const folder=DriveApp.getFolderById(property_('PILOT_ROOT_FOLDER_ID'));
  const count=Math.max(0,ss.getSheetByName(FUSAYA_DOCS.TABS.PILOTS).getLastRow()-1);
  const result={estado:'OK',pestanas:Object.values(FUSAYA_DOCS.TABS),carpeta:folder.getName(),fichasExistentes:count};
  Logger.log(JSON.stringify(result)); return result;
}
