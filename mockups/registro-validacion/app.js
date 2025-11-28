// Opción 3 Wizard avanzado
const steps = [...document.querySelectorAll('.step')];
const panels = [...document.querySelectorAll('.panel')];
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const exportBtn = document.getElementById('btnExport');
const alertsWrap = document.getElementById('alertsWrap');

// Inputs básicos
const placaInput = document.getElementById('placa');
const vinInput = document.getElementById('vin');
const fotosInput = document.getElementById('fotos');
const docsInput = document.getElementById('docs');
const previewFotos = document.getElementById('previewFotos');

// Mantenimientos
const mantFecha = document.getElementById('mantFecha');
const mantTipo = document.getElementById('mantTipo');
const mantKm = document.getElementById('mantKm');
const mantTablaBody = document.querySelector('#mantTabla tbody');
const btnAddMant = document.getElementById('btnAddMant');

// Custodia
const custNombre = document.getElementById('custNombre');
const custDesde = document.getElementById('custDesde');
const custHasta = document.getElementById('custHasta');
const custTablaBody = document.querySelector('#custTabla tbody');
const btnAddCust = document.getElementById('btnAddCust');

// Firma
const firmaCanvas = document.getElementById('firmaCanvas');
const btnClearFirma = document.getElementById('btnClearFirma');
const btnGuardarFirma = document.getElementById('btnGuardarFirma');
const ctxFirma = firmaCanvas.getContext('2d');
let firmando = false;

// Geo
const btnGeo = document.getElementById('btnGeo');
const geoData = document.getElementById('geoData');

// Score
const btnCalcularScore = document.getElementById('btnCalcularScore');
const scoreValor = document.getElementById('scoreValor');
const scoreDetalle = document.getElementById('scoreDetalle');

// Validación final
const btnRecalcular = document.getElementById('btnRecalcular');
const btnEmitir = document.getElementById('btnEmitir');
const validResumen = document.getElementById('validResumen');

// Badges mapping
const badgeMap = {
  placa:'badgePlaca', vin:'badgeVin', runt:'badgeRunt', fotos:'badgeFotos', docs:'badgeDocs', mant:'badgeMant', emis:'badgeEmi', seg:'badgeSeg', cust:'badgeCust', firma:'badgeFirma', geo:'badgeGeo', score:'badgeScore'
};

const state = {
  placaValid:false, vinValid:false, runtValid:false,
  fotos:[], docs:[], mant:[], emisValid:false, segValid:false,
  cust:[], firma:false, geo:false, score:null, scoreDetail:'',
};

let current = 0;

function activateStep(i){
  current = i;
  steps.forEach((s,idx)=>{
    s.classList.toggle('active', idx===i);
    s.setAttribute('aria-selected', idx===i ? 'true':'false');
    panels[idx].classList.toggle('active', idx===i);
  });
  updateProgress();
  window.scrollTo({top:0,behavior:'smooth'});
}

function updateProgress(){
  const ratio = current/(steps.length-1);
  const pct = Math.round(ratio*100);
  progressFill.style.width = pct+'%';
  progressLabel.textContent = 'Progreso '+pct+'%';
}

steps.forEach((step,i)=> step.addEventListener('click',()=> activateStep(i)));

// Validaciones básicas
function validatePlaca(v){return /^[A-Z]{3}\d{3}$/.test(v);}
function validateVIN(v){return /^[A-HJ-NPR-Z0-9]{17}$/.test(v);}

placaInput.addEventListener('input',()=>{
  placaInput.value = placaInput.value.toUpperCase();
  state.placaValid = validatePlaca(placaInput.value.trim());
  syncBadges();
});
vinInput.addEventListener('input',()=>{
  vinInput.value = vinInput.value.toUpperCase();
  state.vinValid = validateVIN(vinInput.value.trim());
  syncBadges();
});

// Evidencias
fotosInput.addEventListener('change',()=>{
  state.fotos = [...fotosInput.files];
  renderPreviews(state.fotos, previewFotos);
  syncBadges();
});
docsInput.addEventListener('change',()=>{
  state.docs = [...docsInput.files];
  syncBadges();
});

function renderPreviews(files, container){
  container.innerHTML='';
  files.forEach(f=>{
    const div = document.createElement('div');
    div.className='preview';
    const url = URL.createObjectURL(f);
    div.innerHTML = `<img src="${url}" alt="foto evidencia">`;
    container.appendChild(div);
  });
}

// Mantenimientos
btnAddMant.addEventListener('click',()=>{
  if(!mantFecha.value || !mantKm.value){alertMsg('Completa fecha y km','warn');return;}
  const item = {fecha:mantFecha.value,tipo:mantTipo.value,km:parseInt(mantKm.value,10)};
  state.mant.push(item);
  drawMant();
  mantFecha.value='';mantKm.value='';
  syncBadges();
});
function drawMant(){
  mantTablaBody.innerHTML='';
  state.mant.forEach((m,idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.fecha}</td><td>${m.tipo}</td><td>${m.km}</td><td><button class='btn danger' data-del-mant='${idx}'>X</button></td>`;
    mantTablaBody.appendChild(tr);
  });
  mantTablaBody.querySelectorAll('[data-del-mant]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const i = parseInt(btn.getAttribute('data-del-mant'),10);
      state.mant.splice(i,1);drawMant();syncBadges();
    });
  });
}

// Custodia
btnAddCust.addEventListener('click',()=>{
  if(!custNombre.value || !custDesde.value){alertMsg('Nombre y fecha desde requeridos','warn');return;}
  const item = {nombre:custNombre.value,desde:custDesde.value,hasta:custHasta.value||''};
  state.cust.push(item);
  drawCust();
  custNombre.value='';custDesde.value='';custHasta.value='';
  syncBadges();
});
function drawCust(){
  custTablaBody.innerHTML='';
  state.cust.forEach((c,idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.nombre}</td><td>${c.desde}</td><td>${c.hasta}</td><td><button class='btn danger' data-del-cust='${idx}'>X</button></td>`;
    custTablaBody.appendChild(tr);
  });
  custTablaBody.querySelectorAll('[data-del-cust]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const i = parseInt(btn.getAttribute('data-del-cust'),10);
      state.cust.splice(i,1);drawCust();syncBadges();
    });
  });
}

// Firma Canvas
ctxFirma.lineWidth = 2;ctxFirma.lineCap='round';ctxFirma.strokeStyle='#222';
function posCanvas(e){
  const rect = firmaCanvas.getBoundingClientRect();
  const x = (e.touches?e.touches[0].clientX:e.clientX)-rect.left;
  const y = (e.touches?e.touches[0].clientY:e.clientY)-rect.top;
  return {x,y};
}
function startDraw(e){firmando=true;ctxFirma.beginPath();const {x,y}=posCanvas(e);ctxFirma.moveTo(x,y);e.preventDefault();}
function draw(e){if(!firmando)return;const {x,y}=posCanvas(e);ctxFirma.lineTo(x,y);ctxFirma.stroke();e.preventDefault();btnGuardarFirma.disabled=false;}
function endDraw(){firmando=false;}
['mousedown','touchstart'].forEach(ev=> firmaCanvas.addEventListener(ev,startDraw));
['mousemove','touchmove'].forEach(ev=> firmaCanvas.addEventListener(ev,draw));
['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=> firmaCanvas.addEventListener(ev,endDraw));
btnClearFirma.addEventListener('click',()=>{ctxFirma.clearRect(0,0,firmaCanvas.width,firmaCanvas.height);state.firma=false;btnGuardarFirma.disabled=true;syncBadges();});
btnGuardarFirma.addEventListener('click',()=>{state.firma=true;alertMsg('Firma guardada','ok');syncBadges();});

// Geolocalización
btnGeo.addEventListener('click',()=>{
  if(!navigator.geolocation){alertMsg('Geolocalización no soportada','warn');return;}
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude,longitude} = pos.coords;
    const ts = new Date().toISOString();
    geoData.textContent = `Lat: ${latitude}\nLon: ${longitude}\nTimestamp: ${ts}`;
    state.geo = true;syncBadges();alertMsg('Coordenadas capturadas','ok');
  },()=> alertMsg('Error obteniendo ubicación','warn'),{enableHighAccuracy:true,timeout:8000});
});

// Score
btnCalcularScore.addEventListener('click',()=>{
  const base = 50;
  const mantBoost = Math.min(state.mant.length*5,25);
  const fotosBoost = Math.min(state.fotos.length*2,20);
  const docsBoost = Math.min(state.docs.length*3,15);
  const firmaBoost = state.firma?10:0;
  const geoBoost = state.geo?5:0;
  const custPenalty = state.cust.length>6? -10:0;
  const raw = base+mantBoost+fotosBoost+docsBoost+firmaBoost+geoBoost+custPenalty;
  const final = Math.max(0,Math.min(100,raw));
  state.score = final;
  state.scoreDetail = `Base: ${base}\nMantenimientos(+): ${mantBoost}\nFotos(+): ${fotosBoost}\nDocs(+): ${docsBoost}\nFirma(+): ${firmaBoost}\nGeo(+): ${geoBoost}\nCustodia(Pen): ${custPenalty}\nTotal: ${final}`;
  scoreValor.textContent = final;
  scoreDetalle.textContent = state.scoreDetail;
  alertMsg('Score calculado','ok');
  syncBadges();
});

// Validación final
btnRecalcular.addEventListener('click',()=> buildResumen());
btnEmitir.addEventListener('click',()=>{
  if(btnEmitir.disabled)return;
  const hashMock = 'HASH-'+Math.random().toString(36).slice(2,12).toUpperCase();
  alertMsg('Certificado emitido '+hashMock,'ok');
  exportBtn.disabled=false;
});
exportBtn.addEventListener('click',()=>{
  if(!state.score){alertMsg('Calcula score antes de exportar','warn');return;}
  alertMsg('Exportación simulada','info');
});

function buildResumen(){
  const arr = [];
  arr.push(state.placaValid?'Placa OK':'Placa inválida');
  arr.push(state.vinValid?'VIN OK':'VIN inválido');
  arr.push(state.fotos.length>=6?`Fotos ${state.fotos.length}`:'Fotos insuficientes');
  arr.push(state.docs.length>=3?`Docs ${state.docs.length}`:'Docs insuficientes');
  arr.push(state.mant.length?`Mantenimientos ${state.mant.length}`:'Sin mantenimientos');
  arr.push(state.cust.length?`Cadena Custodia ${state.cust.length}`:'Custodia vacía');
  arr.push(state.firma?'Firma OK':'Firma faltante');
  arr.push(state.geo?'Geolocalización OK':'Geo faltante');
  arr.push(state.score!==null?`Score ${state.score}`:'Score pendiente');
  validResumen.innerHTML = '<ul>'+arr.map(i=> `<li>${i}</li>`).join('')+'</ul>';
  btnEmitir.disabled = !(state.placaValid && state.vinValid && state.fotos.length>=6 && state.docs.length>=3 && state.firma && state.geo && state.score!==null);
}

function syncBadges(){
  setBadge('placa', state.placaValid);
  setBadge('vin', state.vinValid);
  setBadge('runt', state.runtValid); // placeholder
  setBadge('fotos', state.fotos.length>=6);
  setBadge('docs', state.docs.length>=3);
  setBadge('mant', state.mant.length>=1);
  setBadge('emis', document.getElementById('revFecha').value!=='' );
  setBadge('seg', document.getElementById('soatVig').value!=='' );
  setBadge('cust', state.cust.length>=1);
  setBadge('firma', state.firma);
  setBadge('geo', state.geo);
  setBadge('score', state.score!==null);
  buildResumen();
}
function setBadge(key, ok){
  const id = badgeMap[key];
  const el = document.getElementById(id);
  el.textContent = ok? 'OK':'Pendiente';
  el.className = 'badge '+(ok?'ok':'pending');
}

// Navegación botones data-next / data-prev
[...document.querySelectorAll('[data-next]')].forEach(btn=>{
  btn.addEventListener('click',()=> activateStep(parseInt(btn.getAttribute('data-next'),10)));
});
[...document.querySelectorAll('[data-prev]')].forEach(btn=>{
  btn.addEventListener('click',()=> activateStep(parseInt(btn.getAttribute('data-prev'),10)));
});

function alertMsg(msg,type){
  const div = document.createElement('div');
  div.className='alert '+(type==='ok'?'ok':type==='warn'?'warn':'info');
  div.textContent=msg;
  alertsWrap.appendChild(div);
  setTimeout(()=> div.remove(),4300);
}

// Inicialización
activateStep(0);syncBadges();
