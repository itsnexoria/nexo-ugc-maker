"""End-to-end check. Needs: pip install playwright && playwright install chromium.
Run from the repo root with the app served: npm run build && npx vite preview --port 4173
Then: python3 tests/e2e/split-view-sync.py
Screenshots and downloads go to e2e-out/."""
import os
os.makedirs("e2e-out", exist_ok=True)
from playwright.sync_api import sync_playwright
from PIL import Image
import io
def avg(pg):
    pane = pg.locator('.cl-pane').nth(1).bounding_box()
    png = pg.screenshot(clip={'x':pane['x']+pane['width']*0.35,'y':pane['y']+pane['height']*0.35,'width':pane['width']*0.3,'height':pane['height']*0.25})
    im = Image.open(io.BytesIO(png)).convert('RGB'); px = list(im.getdata())
    return tuple(round(sum(c[i] for c in px)/len(px)) for i in range(3))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width':1366,'height':768}); ctx.add_init_script("localStorage.setItem('nexo-tour-accessory-v1','1'); localStorage.setItem('nexo-tour-clothing-v1','1')")
    pg = ctx.new_page(); pg.goto('http://127.0.0.1:4173/?debug'); pg.wait_for_selector('.home')
    pg.click('text=New Project'); pg.fill('#np-name','Bug'); pg.click('.radio-card:has-text("Blank clothing")'); pg.click('text=Create project')
    pg.wait_for_selector('.workspace'); pg.wait_for_timeout(2500)
    pg.click('.vp-tl .seg button:text-is("Front")'); pg.wait_for_timeout(1200)
    a0 = avg(pg)
    pg.click('button[aria-label="Add color fill"]'); pg.wait_for_timeout(1200)           # dark fill
    a1 = avg(pg)
    pg.evaluate("() => { const s=window.__nexo.clothing.getState(); s.updateLayer(s.selectedId,{color:'#e3242b'}); }"); pg.wait_for_timeout(1200)  # then red
    a2 = avg(pg)
    print('3D torso average colour  blank:', a0, '| after dark fill:', a1, '| after changing to red:', a2)
    print('UPDATED' if a2[0] > a2[2]+60 else 'STALE (3D did not follow the edit)')
    b.close()
