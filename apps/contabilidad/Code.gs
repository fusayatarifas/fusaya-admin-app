const properties = PropertiesService.getScriptProperties();
function table_(name) {
 const sheet=SpreadsheetApp.openById(properties.getProperty('SPREADSHEET_ID')).getSheetByName(name);
 const [headers,...values]=sheet.getDataRange().getDisplayValues();
 return {sheet,headers,rows:values.map((cells,i)=>Object.assign({row:i+2},Object.fromEntries(headers.map((key,j)=>[key,cells[j]]))))};
}
function append_(name,obj){
 const {sheet,headers}=table_(name);
 sheet.appendRow(headers.map(key=>typeof obj[key]==='string' && /^[=+@-]/.test(obj[key])?"'"+obj[key]:obj[key]??''));
}
function edit_(name,row,obj){
 const {sheet,headers}=table_(name);
 for(const [key,value] of Object.entries(obj))sheet.getRange(row,1+headers.indexOf(key)).setValue(value);
}
function config_(){return Object.fromEntries(table_('Configuracion').rows.map(row=>[row.CLAVE,row.VALOR]));}
function verify_(token){
 if(!token||token.length>6000)throw Error('Inicia sesión con Google.');
 const res=UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(token),{muteHttpExceptions:true});
 if(res.getResponseCode()!==200)throw Error('Vuelve a iniciar sesión.');
 const claims=JSON.parse(res.getContentText()),email=String(claims.email).toLowerCase();
 if(claims.aud!==properties.getProperty('CLIENT_ID') || claims.email_verified!=='true'||Number(claims.exp)<=Date.now()/1000 || !table_('Administradores').rows.some(r=>r.ESTADO==='ACTIVO'&&r.EMAIL.toLowerCase()===email))throw Error('Cuenta sin acceso.');
 return email;
}
function day_(){return Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd');}
function week_(){const d=new Date(day_()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
function charge_(code,concept,actor){
 const cfg=config_(),period=week_(),pilot=table_('Pilotos').rows.find(r=>r.CODIGO===code&&r.ESTADO==='ACTIVO');
 if(!pilot)throw Error('Piloto inactivo o inexistente.');
 if(!['RODAMIENTO','SANCION_LEVE','SANCION_GRAVE'].includes(concept))throw Error('Concepto inválido.');
 if(concept==='RODAMIENTO'&&table_('Cargos').rows.some(r=>r.CODIGO_PILOTO===code&&r.CONCEPTO===concept&&r.PERIODO_LUNES===period))return;
 const amount=Number(cfg[concept]);if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Revisa la tarifa.');
 const id=Utilities.getUuid(), token=Utilities.getUuid()+Utilities.getUuid(),url=cfg.PAYMENT_WEBAPP_URL;
 if(!url)throw Error('Falta configurar el portal de pagos.');
 append_('Tokens',{HASH_TOKEN:hash_(token),ID_CARGO:id,VENCE:Date.now()+7*86400000,USADO:'NO',CREADO_EN:day_()});
 append_('Cargos',{ID_CARGO:id,CODIGO_PILOTO:code,CONCEPTO:concept,PERIODO_LUNES:period,FECHA_CARGO:day_(),VALOR:amount,CREDITO_TARJETA:0,TOTAL_PAGADO:0,SALDO:amount,ESTADO:'ABIERTO',ENLACE_PAGO:url+'#'+token,CREADO_POR:actor,CREADO_EN:day_()});
}
function hash_(token){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token));}
function report_(p){
 const t=table_('Tokens').rows.find(r=>r.HASH_TOKEN===hash_(String(p.key||''))&&r.USADO==='NO'&&Number(r.VENCE)>Date.now());
 if(!t)throw Error('Enlace vencido o utilizado.');
 const c=table_('Cargos').rows.find(r=>r.ID_CARGO===t.ID_CARGO&&r.ESTADO==='ABIERTO');
 if(!c||table_('Pagos').rows.some(r=>r.ID_CARGO===t.ID_CARGO&&['PENDIENTE','CONFIRMADO'].includes(r.ESTADO)))throw Error('Este cargo ya tiene un pago.');
 const id=Utilities.getUuid();let file='';
 if(p.medio==='EFECTIVO'){
  if(!table_('Administradores').rows.some(r=>r.EMAIL===p.receptor&&r.ESTADO==='ACTIVO'&&r.RECIBE_EFECTIVO==='SI'))throw Error('Elige quién recibió el efectivo.');
 }else if(p.medio==='TRANSFERENCIA'){
  if(typeof p.image!=='string'||p.image.length>8*1024*1024)throw Error('La imagen supera el tamaño permitido.');
  const bytes=Utilities.base64Decode(p.image),prefix=bytes.slice(0,8).map(b=>b&255).join(',');
  const mime=prefix==='137,80,78,71,13,10,26,10'?'image/png':prefix.startsWith('255,216,255,')?'image/jpeg':'';
  if(!mime)throw Error('Elige una foto JPG o PNG.');
  const root=DriveApp.getFolderById(config_().RECEIPTS_FOLDER_ID),folders=root.getFoldersByName(c.CODIGO_PILOTO);
  const folder=folders.hasNext()?folders.next():root.createFolder(c.CODIGO_PILOTO);
  file=folder.createFile(Utilities.newBlob(bytes,mime,id+(mime==='image/png'?'.png':'.jpg'))).getId();
 }else throw Error('Medio inválido.');
 append_('Pagos',{ID_PAGO:id,ID_CARGO:c.ID_CARGO,CODIGO_PILOTO:c.CODIGO_PILOTO,FECHA_REPORTE:day_(),VALOR:Number(c.SALDO),MEDIO:p.medio,ADMIN_RECEPTOR:p.medio==='EFECTIVO'?p.receptor:'',DRIVE_FILE_ID:file,ESTADO:'PENDIENTE',REGISTRADO_EN:day_()});
 return 'Recibido. La administración revisará tu pago.';
}
function operar_(action,p,token){
 if(action==='report')return report_(p);
 if(action==='receivers'){
 const t=table_('Tokens').rows.find(r=>r.HASH_TOKEN===hash_(String(p.key||''))&&r.USADO==='NO'&&Number(r.VENCE)>Date.now());
 if(!t)throw Error('Enlace vencido.');
 return table_('Administradores').rows.filter(r=>r.ESTADO==='ACTIVO'&&r.RECIBE_EFECTIVO==='SI').map(r=>({name:r.NOMBRE,id:r.EMAIL}));}
 const email=verify_(token);
 if(action==='init'){const cfg=config_();return {pilotos:table_('Pilotos').rows,cargos:table_('Cargos').rows,pagos:table_('Pagos').rows,key:cfg.CLAVE_TRANSFERENCIA,bank:cfg.DESTINO_TRANSFERENCIA};}
 if(action==='pilot'){
 if(!/^\d{2}_[\p{L}\d-]{1,40}$/u.test(p.codigo)||!/^\d{10,15}$/.test(p.telefono))throw Error('Revisa el código NN_Alias y el WhatsApp.');
 if(table_('Pilotos').rows.some(r=>r.NUMERO.padStart(2,'0')===p.codigo.slice(0,2)))throw Error('Número de piloto ocupado.');
 append_('Pilotos',{CODIGO:p.codigo,ALIAS:p.codigo.slice(3),NUMERO:p.codigo.slice(0,2),WHATSAPP:p.telefono,ESTADO:'ACTIVO',FECHA_ALTA:day_()});return true;}
 if(action==='charge'){charge_(p.codigo,p.concepto,email);return true;}
 if(action==='receipt'){const pay=table_('Pagos').rows.find(r=>r.ID_PAGO===p.id);if(!pay?.DRIVE_FILE_ID)throw Error('Sin comprobante.');const b=DriveApp.getFileById(pay.DRIVE_FILE_ID).getBlob();return {mime:b.getContentType(),data:Utilities.base64Encode(b.getBytes())};}
 if(action==='review'){
 const pay=table_('Pagos').rows.find(r=>r.ID_PAGO===p.id),c=table_('Cargos').rows.find(r=>r.ID_CARGO===pay?.ID_CARGO);
 if(!pay||pay.ESTADO!=='PENDIENTE'||!c)throw Error('Pago fuera de revisión.');
 if(p.aprobar===true){edit_('Cargos',c.row,{TOTAL_PAGADO:Number(pay.VALOR),SALDO:0,ESTADO:'PAGADO'});}
 edit_('Pagos',pay.row,{ESTADO:p.aprobar===true?'CONFIRMADO':'RECHAZADO',CONFIRMADO_POR:email,FECHA_CONFIRMACION:day_()});return true;}
 throw Error('Acción desconocida.');
}
function doPost(e){
 const lock=LockService.getScriptLock();let result;
 try{lock.waitLock(30000);const req=JSON.parse(e.postData.contents);result={ok:true,value:operar_(req.action,req.payload||{},req.token)};}
 catch(err){result={ok:false,error:err.message};}finally{if(lock.hasLock())lock.releaseLock();}
 return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function generarLunes_(){const lock=LockService.getScriptLock();lock.waitLock(30000);try{table_('Pilotos').rows.filter(r=>r.ESTADO==='ACTIVO').forEach(r=>charge_(r.CODIGO,'RODAMIENTO','Automático'));}finally{lock.releaseLock();}}
function activarLunes(){if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='generarLunes_'))ScriptApp.newTrigger('generarLunes_').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).inTimezone('America/Bogota').create();}
