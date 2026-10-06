"""End-to-end check. Needs: pip install playwright && playwright install chromium.
Run from the repo root with the app served: npm run build && npx vite preview --port 4173
Then: python3 tests/e2e/accessory-painting.py
Screenshots and downloads go to e2e-out/."""
import os
os.makedirs("e2e-out", exist_ok=True)
from playwright.sync_api import sync_playwright
from PIL import Image
import io, json, struct
def st(pg, js): return pg.evaluate("() => { const ed = window.__nexo.editor.getState(); return (%s); }" % js)
def glb_images(path):
    raw=open(path,'rb').read(); jlen=struct.unpack('<I',raw[12:16])[0]; js=json.loads(raw[20:20+jlen]); buf=raw[20+jlen+8:]
    out=[]
    for img in js.get('images',[]):
        bv=js['bufferViews'][img['bufferView']]; out.append(Image.open(io.BytesIO(buf[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGBA'))
    return out
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width':1366,'height':768}, accept_downloads=True); ctx.add_init_script("localStorage.setItem('nexo-tour-accessory-v1','1')")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:4173/?debug'); pg.wait_for_selector('.home')
    pg.click('text=New Project'); pg.fill('#np-name','Paint'); pg.click('text=Create project'); pg.wait_for_selector('.workspace'); pg.wait_for_timeout(1500)
    pg.click('button[aria-label="Add Part"]'); pg.click('.picker-item:has-text("Cube")'); pg.wait_for_timeout(400)
    # make the cube big and move it in front of the avatar so it is an easy target
    pg.evaluate("() => { const e=window.__nexo.editor.getState(); e.setTransform(e.selectedId,{position:[0,3,-3],scale:[2.5,2.5,2.5]}); }")
    pg.click('.vp-tl .seg button:text-is("Front")'); pg.wait_for_timeout(1300)
    pg.keyboard.press('b'); pg.wait_for_timeout(300)
    print('1 tool:', st(pg,'ed.tool'), '| paint section visible:', pg.locator('.section-head:has-text("Paint")').count()==1)
    # aim at the cube centre via the camera projection
    c = pg.evaluate("""() => { const {editor, viewport} = window.__nexo; const id = editor.getState().selectedId; const o = viewport.registry.get(id);
      const wp = o.position.clone(); o.getWorldPosition(wp); const p = wp.clone().project(viewport.camera); const r = viewport.gl.domElement.getBoundingClientRect();
      return [r.left+(p.x+1)/2*r.width, r.top+(1-p.y)/2*r.height]; }""")
    pg.mouse.move(c[0]-30, c[1]-20); pg.mouse.down(); pg.mouse.move(c[0]+40, c[1]+30, steps=14); pg.mouse.up(); pg.wait_for_timeout(500)
    o = st(pg,"(()=>{const o=ed.objects[ed.selectedId]; return {res:o.paint&&o.paint.res, strokes:o.paint&&o.paint.strokes.length, pts:o.paint&&o.paint.strokes[0].points.length, sample:o.paint&&o.paint.strokes[0].points[0].map(Math.round)}})()")
    print('2 painted:', o, '| undo steps from stroke:', st(pg,'ed.past.length'))
    pg.screenshot(path='e2e-out/acc_paint.png', clip={'x':48,'y':84,'width':1030,'height':470})
    # orbit still works on empty space
    cam0 = pg.evaluate("()=>window.__nexo.viewport.camera.position.toArray().map(v=>Math.round(v*10)/10)")
    pg.mouse.move(150, 200); pg.mouse.down(); pg.mouse.move(210, 215, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    print('3 orbit on empty space moved camera:', cam0 != pg.evaluate("()=>window.__nexo.viewport.camera.position.toArray().map(v=>Math.round(v*10)/10)"), '| controls enabled:', pg.evaluate("()=>window.__nexo.viewport.controls.enabled"))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    print('4 undo one stroke -> paint present:', st(pg,'!!ed.objects[ed.selectedId].paint'), '(expect False)')
    pg.keyboard.press('Control+y'); pg.wait_for_timeout(300)
    # export GLB both ways, check the painted pixels are in the image
    for merged in (True, False):
        pg.click('button:has-text("Export")'); pg.wait_for_selector('.export-grid')
        cb = pg.locator('label:has-text("Join into one mesh") input')
        if cb.is_checked() != merged: cb.click()
        pg.click('.radio-card:has-text("GLB")')
        with pg.expect_download() as d: pg.click('.modal-foot .btn.primary')
        d.value.save_as('e2e-out/paint.glb')
        imgs = glb_images('e2e-out/paint.glb')
        red = 0
        for im in imgs:
            red += sum(1 for px in im.resize((128,128)).getdata() if px[0]>200 and px[1]<80 and px[2]<90 and px[3]>200)
        print('5', 'MERGED' if merged else 'PLAIN ', 'images', len(imgs), 'red painted px (of 128x128):', red)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # reload keeps paint
    pg.keyboard.press('Control+s'); pg.wait_for_timeout(900); pg.reload(); pg.wait_for_selector('.home')
    pg.click('.proj-card:has-text("Paint") .proj-open'); pg.wait_for_selector('.workspace'); pg.wait_for_timeout(1500)
    print('6 after reload strokes:', st(pg,"Object.values(ed.objects).filter(o=>o.paint).map(o=>o.paint.strokes.length)"))
    print('errors:', errs[:6] or 'none'); b.close()
