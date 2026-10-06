"""End-to-end check. Needs: pip install playwright && playwright install chromium.
Run from the repo root with the app served: npm run build && npx vite preview --port 4173
Then: python3 tests/e2e/offline-and-tablet.py
Screenshots and downloads go to e2e-out/."""
import os
os.makedirs("e2e-out", exist_ok=True)
from playwright.sync_api import sync_playwright
import json
def run(p):
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    # ---------- offline / service worker
    ctx = b.new_context(viewport={'width':1366,'height':768}, accept_downloads=True)
    ctx.add_init_script("localStorage.setItem('nexo-tour-accessory-v1','1'); localStorage.setItem('nexo-tour-clothing-v1','1')")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:4173/'); pg.wait_for_selector('.home')
    pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null || true", timeout=5000)
    pg.wait_for_timeout(2500)
    pg.reload(); pg.wait_for_selector('.home'); pg.wait_for_timeout(1500)   # now controlled by the SW; assets get cached as they load
    print('1 service worker controlling page:', pg.evaluate("!!navigator.serviceWorker.controller"), '| cache keys:', pg.evaluate("caches.keys()"))
    # open a project so the editor chunks are cached too, then go home
    pg.click('.proj-card:has-text("Cyber Crown") .proj-open'); pg.wait_for_selector('.workspace'); pg.wait_for_timeout(2000)
    pg.reload(); pg.wait_for_selector('.home'); pg.wait_for_timeout(800)
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_selector('.home', timeout=15000)
    print('2 OFFLINE reload shows the dashboard:', pg.locator('.proj-card').count() >= 1, '| offline banner text:', 'offline' in pg.locator('.home-side').inner_text().lower())
    pg.click('.proj-card:has-text("Cyber Crown") .proj-open'); pg.wait_for_selector('.workspace', timeout=15000); pg.wait_for_timeout(2000)
    pg.screenshot(path='e2e-out/offline_editor.png')
    print('3 OFFLINE editor opens with the saved project, objects:', pg.evaluate("document.querySelector('.tab .count')?.textContent"))
    ctx.set_offline(False)
    print('errors:', errs[:4] or 'none')
    ctx.close()
    # ---------- tablet layouts (touch)
    for name,(w,h) in {'tablet-landscape':(1024,768),'tablet-portrait':(820,1180)}.items():
        c = b.new_context(viewport={'width':w,'height':h}, has_touch=True, is_mobile=False, accept_downloads=True)
        c.add_init_script("localStorage.setItem('nexo-tour-accessory-v1','1'); localStorage.setItem('nexo-tour-clothing-v1','1')")
        q = c.new_page(); q.goto('http://127.0.0.1:4173/?debug'); q.wait_for_selector('.home'); q.wait_for_timeout(500)
        q.screenshot(path=f'e2e-out/{name}-home.png')
        q.click('.proj-card:has-text("Cyber Crown") .proj-open'); q.wait_for_selector('.workspace'); q.wait_for_timeout(2200)
        q.screenshot(path=f'e2e-out/{name}-editor.png')
        right_hidden = q.evaluate("document.querySelector('.right').getBoundingClientRect().left >= window.innerWidth - 2")
        q.click('button[aria-label="Toggle panels"]'); q.wait_for_timeout(400)
        shown = q.evaluate("document.querySelector('.right').getBoundingClientRect().left < window.innerWidth - 200")
        q.screenshot(path=f'e2e-out/{name}-panels.png')
        overflow = q.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2")
        print(f'4 {name}: panel hidden by default={right_hidden}, opens via button={shown}, horizontal page overflow={overflow}')
        c.close()
    # ---------- phone gate
    c = b.new_context(viewport={'width':390,'height':844}, has_touch=True); q = c.new_page(); q.goto('http://127.0.0.1:4173/'); q.wait_for_timeout(800)
    print('5 phone shows the desktop message:', 'works best on desktop' in q.inner_text('body'), '| continue anyway button:', q.locator('text=Continue anyway').count()==1)
    q.click('text=Continue anyway'); q.wait_for_timeout(400); q.screenshot(path='e2e-out/phone-home.png')
    b.close()
with sync_playwright() as p: run(p)
