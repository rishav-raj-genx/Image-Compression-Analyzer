# Image Compression Analyzer

Run: open index.html in a modern browser (Chrome/Edge/Safari). The app is client-side only.

Notes:
- Uses OffscreenCanvas & convertToBlob in a Worker for non-blocking compression and metric calculation.
- Metrics include sizes, compression ratio, PSNR and a heuristic "estimated quality loss".
- If browser lacks OffscreenCanvas.convertToBlob support, replace with canvas.toBlob fallback in main thread (not included).