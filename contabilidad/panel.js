let session='',state;
const el=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
async function run(task){try{el('msg').textContent='Cargando…';await task();el('msg').textContent='';}catch(e){el('msg').textContent=e.message;}}
async function refresh(){state=await request('init',{},session);const prev=el('pilots').value;el('pilots').replaceChildren(...state.pilotos.map(p=>new Option(p.CODIGO,p.CODIGO)));if(state.pilotos.some(p=>p.CODIGO===prev))el('pilots').value=prev;el('panel').hidden=false;render();}
function enter(response){session=response.credential;run(refresh);}
function button(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=()=>run(fn);return b;}
function render(){
 const code=el('pilots').value;const records=state.cargos.filter(c=>c.CODIGO_PILOTO===code);
 el('history').replaceChildren(...records.map(c=>{const a=document.createElement('article');a.textContent=c.FECHA_CARGO+' · '+c.CONCEPTO+' · '+money(c.VALOR)+' · '+c.ESTADO;
 if(c.ESTADO==='ABIERTO'){const link=document.createElement('a'),pilot=state.pilotos.find(p=>p.CODIGO===code),number=String(pilot.WHATSAPP);link.textContent='Enviar cobro por WhatsApp';link.href='https://wa.me/'+(number.length===10?'57':'')+number+'?text='+encodeURIComponent('Hola '+pilot.ALIAS+', tu cobro FUSAYA por '+c.CONCEPTO+' es de '+money(c.SALDO)+'. Transfiere a '+state.bank+', llave '+state.key+', o entrega efectivo al administrador. Reporta tu pago aquí: '+c.ENLACE_PAGO);a.append(link);}return a;}));
 for(const p of state.pagos.filter(p=>p.CODIGO_PILOTO===code)){const a=document.createElement('p');a.textContent=p.FECHA_REPORTE+' · '+p.MEDIO+' · '+money(p.VALOR)+' · '+p.ESTADO;el('history').append(a);}
 el('pending').replaceChildren(...state.pagos.filter(p=>p.ESTADO==='PENDIENTE').map(p=>{const a=document.createElement('article');a.textContent=p.CODIGO_PILOTO+' · '+money(p.VALOR)+' · '+p.MEDIO+' '+p.ADMIN_RECEPTOR;
 if(p.DRIVE_FILE_ID)a.append(button('Ver comprobante',async()=>{const d=await request('receipt',{id:p.ID_PAGO},session);const img=document.createElement('img');img.alt='Comprobante';img.src='data:'+d.mime+';base64,'+d.data;a.append(img);}));
 for(const [label,aprobar] of [['Confirmar pago',true],['Rechazar',false]])a.append(button(label,async()=>{if(!confirm(label+' de '+p.CODIGO_PILOTO+'?'))return;await request('review',{id:p.ID_PAGO,aprobar},session);await refresh();}));return a;}));}
el('pilots').onchange=render;el('pilot').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));run(async()=>{await request('pilot',data,session);await refresh();el('pilot').reset();});};el('charge').onclick=()=>run(async()=>{await request('charge',{codigo:el('pilots').value,concepto:el('concept').value},session);await refresh();});