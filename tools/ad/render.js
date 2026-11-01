const { chromium } = require('playwright'); const path = require('path'); const { spawn } = require('child_process');
(async () => {
  const FPS = +(process.env.FPS || 60), out = process.argv[2] || 'ad.mp4', t0 = +(process.env.T0 || 0), t1 = +(process.env.T1 || 47);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => console.error('PAGEERR', e.message));
  await p.goto('file://' + path.resolve(__dirname, 'index.html')); await p.evaluate(() => window.ready);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-ss', String(t0), '-i', path.join(__dirname, 'ad_audio.wav'), '-t', String(t1 - t0),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '256k', '-shortest', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round((t1 - t0) * FPS); const st = Date.now();
  for (let i = 0; i < n; i++) {
    const d = await p.evaluate(t => { renderFrame(t); return document.getElementById('c').toDataURL('image/jpeg', 0.94); }, t0 + i / FPS);
    if (!ff.stdin.write(Buffer.from(d.slice(23), 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`frame ${i}/${n} ${((Date.now() - st) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close(); console.log('done', out);
})();
