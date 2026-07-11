// entry script (ES module)
const fileInput = document.getElementById('fileInput');
const btnChoose = document.getElementById('btnChoose');
const btnCompress = document.getElementById('btnCompress');
const btnReset = document.getElementById('btnReset');
const btnDownload = document.getElementById('btnDownload');
const dropZone = document.getElementById('dropZone');
const qualityEl = document.getElementById('quality');
const qualityVal = document.getElementById('qualityVal');

const origCanvas = document.getElementById('origCanvas');
const compCanvas = document.getElementById('compCanvas');
const origMeta = document.getElementById('origMeta');
const compMeta = document.getElementById('compMeta');

const ratioEl = document.getElementById('ratio');
const psnrEl = document.getElementById('psnr');
const qlossEl = document.getElementById('qloss');
const timeEl = document.getElementById('time');

let originalImage = null; // ImageBitmap
let originalBlob = null;
let compressedBlob = null;

let worker = new Worker('js/worker.js');

btnChoose.addEventListener('click', ()=>fileInput.click());
fileInput.addEventListener('change', e=>handleFiles(e.target.files));
dropZone.addEventListener('click', ()=>fileInput.click());
;['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{ e.preventDefault(); dropZone.classList.add('drag'); }));
;['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev,e=>{ e.preventDefault(); dropZone.classList.remove('drag'); }));
dropZone.addEventListener('drop', e=>handleFiles(e.dataTransfer.files));

qualityEl.addEventListener('input', ()=>qualityVal.textContent = qualityEl.value);

btnCompress.addEventListener('click', compressAndAnalyze);
btnReset.addEventListener('click', resetAll);
btnDownload.addEventListener('click', downloadCompressed);

worker.addEventListener('message', (ev)=>{
  const {type, payload} = ev.data;
  if(type === 'result'){
    const {compBlob, compImageBitmap, metrics, timeMs} = payload;
    compressedBlob = compBlob;
    renderCanvasBitmap(compCanvas, compImageBitmap);
    compMeta.innerHTML = metaList({
      'Compressed size': readableSize(compBlob.size),
      'Format': compBlob.type,
      'Dimensions': `${metrics.width} × ${metrics.height}`
    });
    ratioEl.textContent = metrics.ratio.toFixed(2) + '×';
    psnrEl.textContent = metrics.psnr === Infinity ? '∞' : metrics.psnr.toFixed(2) + ' dB';
    qlossEl.textContent = metrics.qualityLoss.toFixed(2) + '%';
    timeEl.textContent = timeMs + ' ms';
    btnDownload.disabled = false;
  } else if(type === 'error'){
    alert(ev.data.message || 'Worker error');
  }
});

async function handleFiles(files){
  if(!files || !files.length) return;
  const f = files[0];
  if(!f.type.startsWith('image/')) { alert('Please select an image.'); return; }
  originalBlob = f;
  const imgBitmap = await createImageBitmap(f);
  originalImage = imgBitmap;
  renderCanvasBitmap(origCanvas, imgBitmap);
  origMeta.innerHTML = metaList({
    'Original size': readableSize(f.size),
    'Format': f.type,
    'Dimensions': `${imgBitmap.width} × ${imgBitmap.height}`
  });
  btnCompress.disabled = false;
  btnReset.disabled = false;
  btnDownload.disabled = true;
  // Reset analysis
  ratioEl.textContent = psnrEl.textContent = qlossEl.textContent = timeEl.textContent = '—';
  compMeta.innerHTML = '';
  clearCanvas(compCanvas);
}

function renderCanvasBitmap(canvas, bitmap){
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap, 0, 0);
}

function clearCanvas(canvas){
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,1,1);
}

function metaList(obj){
  return Object.entries(obj).map(([k,v]) => `<li><span>${k}</span><strong>${v}</strong></li>`).join('');
}

function readableSize(bytes){
  if(bytes < 1024) return `${bytes} B`;
  if(bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(2)} MB`;
}

function resetAll(){
  originalImage = null; originalBlob = null; compressedBlob = null;
  origMeta.innerHTML = compMeta.innerHTML = '';
  clearCanvas(origCanvas); clearCanvas(compCanvas);
  btnCompress.disabled = true; btnReset.disabled = true; btnDownload.disabled = true;
  ratioEl.textContent = psnrEl.textContent = qlossEl.textContent = timeEl.textContent = '—';
}

function downloadCompressed(){
  if(!compressedBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(compressedBlob);
  a.download = `compressed.${compressedBlob.type.split('/')[1] || 'jpg'}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function compressAndAnalyze(){
  if(!originalImage || !originalBlob) return;
  btnCompress.disabled = true;
  btnDownload.disabled = true;
  const quality = Number(qualityEl.value) / 100;
  // send transferable ImageBitmap and original blob as ArrayBuffer for worker
  const start = performance.now();
  const ab = await originalBlob.arrayBuffer();
  worker.postMessage({
    type: 'compress',
    payload: {
      originalBuffer: ab,
      mime: originalBlob.type || 'image/jpeg',
      quality
    }
  }, [ab]);
  // re-enable after worker returns
  btnCompress.disabled = false;
}