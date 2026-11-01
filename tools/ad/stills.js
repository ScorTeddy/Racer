const { chromium } = require('playwright'); const fs = require('fs'); const path=require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, 'index.html')); await p.evaluate(() => window.ready);
  const times = process.argv.slice(2).map(Number); fs.mkdirSync(__dirname+'/stills',{recursive:true});
  for (const t of times) {
    const d = await p.evaluate(t => { renderFrame(t); return document.getElementById('c').toDataURL('image/jpeg', 0.85); }, t);
    fs.writeFileSync(`${__dirname}/stills/t${t.toFixed(2)}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
  }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
