// Worker: compresses image using OffscreenCanvas and computes metrics (PSNR)
self.addEventListener('message', async (ev) => {
  const {type, payload} = ev.data;
  if(type !== 'compress') return;
  try{
    const t0 = performance.now();
    const {originalBuffer, mime, quality} = payload;
    const blob = new Blob([originalBuffer], {type: mime});
    const imgBitmap = await createImageBitmap(blob);
    const width = imgBitmap.width, height = imgBitmap.height;

    // Choose output type: use image/webp or image/jpeg fallback
    const outType = ('image/webp' in self) ? 'image/webp' : 'image/jpeg';

    // Use OffscreenCanvas
    const off = new OffscreenCanvas(width, height);
    const ctx = off.getContext('2d');
    ctx.drawImage(imgBitmap, 0, 0, width, height);

    // Get original pixels for metrics (ImageData)
    const origImageData = ctx.getImageData(0,0,width,height);

    // compress
    const blobCompressed = await off.convertToBlob({type: outType, quality}); // modern API
    // create bitmap of compressed for comparisons
    const compBitmap = await createImageBitmap(blobCompressed);

    // draw compressed to a temp canvas to get pixels
    const off2 = new OffscreenCanvas(width, height);
    const ctx2 = off2.getContext('2d');
    ctx2.drawImage(compBitmap, 0, 0, width, height);
    const compImageData = ctx2.getImageData(0,0,width,height);

    // metrics
    const origSize = originalBuffer.byteLength;
    const compSize = blobCompressed.size;
    const ratio = origSize / compSize || 0;
    const psnr = computePSNR(origImageData.data, compImageData.data);
    const qualityLoss = psnrToLoss(psnr);

    const t1 = Math.round(performance.now() - t0);

    // send transferable comp blob as ArrayBuffer? we'll send blob and imageBitmap.
    // Blob is clonable
    self.postMessage({
      type: 'result',
      payload: {
        compBlob: blobCompressed,
        compImageBitmap: compBitmap,
        metrics: { width, height, origSize, compSize, ratio, psnr, qualityLoss },
        timeMs: t1
      }
    });
  }catch(err){
    self.postMessage({type:'error', message: err.message});
  }
});

// compute MSE/PSNR (8-bit per channel RGB)
function computePSNR(a, b){
  // a,b are Uint8ClampedArray RGBA
  let mse = 0;
  const n = a.length / 4;
  for(let i=0, j=0; i<a.length; i+=4, j++){
    const dr = a[i] - b[i];
    const dg = a[i+1] - b[i+1];
    const db = a[i+2] - b[i+2];
    mse += (dr*dr + dg*dg + db*db) / 3;
  }
  mse = mse / n;
  if(mse === 0) return Infinity;
  const PIXEL_MAX = 255;
  const psnr = 10 * Math.log10((PIXEL_MAX*PIXEL_MAX) / mse);
  return psnr;
}

// Convert PSNR to a user-friendly "quality loss" percentage (heuristic)
function psnrToLoss(psnr){
  if(psnr === Infinity) return 0;
  // PSNR > 40 dB => near lossless; < 20 dB => heavy loss
  const max = 60; const min = 15;
  const clamped = Math.max(min, Math.min(max, psnr));
  const normalized = (max - clamped) / (max - min); // 0..1
  return normalized * 100;
}