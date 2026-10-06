"""End-to-end check. Needs: pip install playwright && playwright install chromium.
Run from the repo root with the app served: npm run build && npx vite preview --port 4173
Then: python3 tests/e2e/layered-export.py
Screenshots and downloads go to e2e-out/."""
import os
os.makedirs("e2e-out", exist_ok=True)
from playwright.sync_api import sync_playwright
import json, struct, os
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width':1366,'height':768}, accept_downloads=True); ctx.add_init_script("localStorage.setItem('nexo-tour-clothing-v1','1')")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:4173/?debug'); pg.wait_for_selector('.home')
    pg.click('text=New Project'); pg.fill('#np-name','Layered Test'); pg.click('.radio-card:has-text("Cyber outfit")'); pg.click('text=Create project')
    pg.wait_for_selector('.workspace'); pg.wait_for_timeout(2200)
    pg.click('.cl-bar .seg button:text-is("3D")'); pg.click('.vp-tl .seg button:text-is("Front")'); pg.wait_for_timeout(1200)
    pg.screenshot(path='e2e-out/puff0.png', clip={'x':48,'y':84,'width':1030,'height':470})
    pg.evaluate("()=>window.__nexo.clothing.getState().setPuffiness(0.24)"); pg.wait_for_timeout(1200)
    pg.screenshot(path='e2e-out/puff1.png', clip={'x':48,'y':84,'width':1030,'height':470})
    pg.click('button:has-text("Export")'); pg.wait_for_selector('.layered-box'); pg.wait_for_timeout(400)
    with pg.expect_download() as d: pg.click('text=Download layered starter (GLB)')
    path='e2e-out/'+d.value.suggested_filename; d.value.save_as(path); raw=open(path,'rb').read()
    jlen=struct.unpack('<I',raw[12:16])[0]; js=json.loads(raw[20:20+jlen])
    print('file', d.value.suggested_filename, len(raw), 'bytes | skins', len(js['skins']), '| images (design texture):', len(js.get('images',[])), '| meshes:', [m.get('name') for m in js['meshes']])
    pg.wait_for_timeout(300); print('stats shown:', pg.locator('[aria-label="Layered export details"]').inner_text().replace('\n',' | ')[:200])
    pg.screenshot(path='e2e-out/layered_modal.png')
    print('errors:', errs[:6] or 'none'); b.close()
