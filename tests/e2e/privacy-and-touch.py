"""End-to-end check. Needs: pip install playwright && playwright install chromium.
Run from the repo root with the app served: npm run build && npx vite preview --port 4173
Then: python3 tests/e2e/privacy-and-touch.py
Screenshots and downloads go to e2e-out/."""
import os
os.makedirs("e2e-out", exist_ok=True)
from playwright.sync_api import sync_playwright
import zipfile, io
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    c = b.new_context(viewport={'width':1024,'height':768}, has_touch=True, accept_downloads=True)
    c.add_init_script("localStorage.setItem('nexo-tour-accessory-v1','1'); localStorage.setItem('nexo-tour-clothing-v1','1')")
    q = c.new_page(); errs=[]; q.on('pageerror', lambda e: errs.append(str(e))); q.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    q.goto('http://127.0.0.1:4173/?debug'); q.wait_for_selector('.home')
    q.click('text=New Project'); q.fill('#np-name','Tablet Outfit'); q.click('.radio-card:has-text("Cyber outfit")'); q.click('text=Create project')
    q.wait_for_selector('.workspace'); q.wait_for_timeout(2200)
    print('1 clothing on a tablet starts in single-pane 2D mode:', q.evaluate("window.__nexo.clothing.getState().viewMode"))
    q.screenshot(path='e2e-out/tablet-clothing.png')
    # pinch zoom via CDP touch events
    box = q.locator('.design-wrap canvas').bounding_box(); cx, cy = box['x']+box['width']/2, box['y']+box['height']/2
    z0 = q.inner_text('.design-zoom')
    cdp = c.new_cdp_session(q)
    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':cx-30,'y':cy,'id':1},{'x':cx+30,'y':cy,'id':2}]})
    for k in range(1,9):
        cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':cx-30-k*12,'y':cy,'id':1},{'x':cx+30+k*12,'y':cy,'id':2}]})
    cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
    q.wait_for_timeout(300); print('2 pinch zoom:', z0, '->', q.inner_text('.design-zoom'))
    # touch drag moves a layer
    layer = q.evaluate("(()=>{const s=window.__nexo.clothing.getState(); const l=s.designs.shirt.find(l=>l.type==='text'); s.select(l.id); return [l.id,l.x,l.y]})()")
    # ---- privacy modal
    q.click('.avatar-btn'); q.click('text=Privacy and your data'); q.wait_for_selector('.trust-row'); q.wait_for_timeout(500)
    q.screenshot(path='e2e-out/privacy.png')
    with q.expect_download() as d: q.click('text=Download a backup of all projects')
    d.value.save_as('e2e-out/backup.zip'); z=zipfile.ZipFile('e2e-out/backup.zip'); print('3 backup zip:', [n for n in z.namelist()])
    q.keyboard.press('Escape'); q.wait_for_timeout(200)
    # delete everything
    q.click('.avatar-btn'); q.click('text=Privacy and your data'); q.wait_for_selector('.trust-row')
    q.click('text=Delete all local data'); q.click('.modal-foot .btn.danger')
    q.wait_for_selector('.home', timeout=15000); q.wait_for_timeout(1500)
    print('4 after delete-all: projects left =', q.locator('.proj-card').count(), '(first-run sample is re-created on reload) | local keys =', q.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('nexo-')).length"))
    print('errors:', errs[:5] or 'none'); b.close()
