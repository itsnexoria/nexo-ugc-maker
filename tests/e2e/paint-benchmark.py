"""End-to-end check. Needs: pip install playwright && playwright install chromium.
Run from the repo root with the app served: npm run build && npx vite preview --port 4173
Then: python3 tests/e2e/paint-benchmark.py
Screenshots and downloads go to e2e-out/."""
import os
os.makedirs("e2e-out", exist_ok=True)
from playwright.sync_api import sync_playwright
import json, sys
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width':1366,'height':768}); ctx.add_init_script("localStorage.setItem('nexo-tour-clothing-v1','1')")
    pg = ctx.new_page(); pg.goto('http://127.0.0.1:4173/?debug'); pg.wait_for_selector('.home')
    pg.click('text=New Project'); pg.fill('#np-name','Bench'); pg.click('.radio-card:has-text("Cyber outfit")'); pg.click('text=Create project')
    pg.wait_for_selector('.workspace'); pg.wait_for_timeout(2000)
    res = pg.evaluate("""async () => {
      const cl = window.__nexo.clothing, comp = window.__nexo.composite;
      const s = cl.getState();
      s.setBrush({color:'#e3242b', size:18, hardness:0.3, opacity:0.6, symmetry:false});
      // a realistic document: presets + a paint layer that already holds 40 strokes
      for (let i=0;i<40;i++) {
        const r = cl.getState().beginStroke({color:'#16171b', size:8, erase:false, points:[[240+(i%5)*10, 90+i*2]]});
        for (let k=1;k<30;k++) cl.getState().extendStroke(r.layerId, r.index, [240+(i%5)*10+k*2, 90+i*2+Math.sin(k/3)*6], null);
      }
      comp.ensureComposite('shirt');
      // now time what a user drags through: each pointer move = store update + redraw
      const r = cl.getState().beginStroke({color:'#e3242b', size:18, erase:false, points:[[250,120]]});
      const times = [];
      for (let k=1;k<=120;k++) {
        const t0 = performance.now();
        cl.getState().extendStroke(r.layerId, r.index, [250+k*0.8, 120+Math.sin(k/6)*25], null);
        comp.ensureComposite('shirt');
        times.push(performance.now()-t0);
      }
      times.sort((a,b)=>a-b);
      const sum = times.reduce((a,b)=>a+b,0);
      return {avg: sum/times.length, p95: times[Math.floor(times.length*0.95)], max: times[times.length-1], layers: cl.getState().designs.shirt.length};
    }""")
    print(json.dumps({k:(round(v,2) if isinstance(v,float) else v) for k,v in res.items()}))
    b.close()
