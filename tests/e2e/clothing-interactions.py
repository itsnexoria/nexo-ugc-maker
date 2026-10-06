"""End-to-end check. Needs: pip install playwright && playwright install chromium.
Run from the repo root with the app served: npm run build && npx vite preview --port 4173
Then: python3 tests/e2e/clothing-interactions.py
Screenshots and downloads go to e2e-out/."""
import os
os.makedirs("e2e-out", exist_ok=True)
from playwright.sync_api import sync_playwright
from PIL import Image
import os, math
def state(pg, js): return pg.evaluate("() => { const cl = window.__nexo.clothing.getState(); return (%s); }" % js)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width':1366,'height':768}, accept_downloads=True)
    ctx.add_init_script("localStorage.setItem('nexo-tour-accessory-v1','1'); localStorage.setItem('nexo-tour-clothing-v1','1')")
    pg = ctx.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:4173/?debug'); pg.wait_for_selector('.home')
    pg.click('text=New Project'); pg.fill('#np-name','Interact'); pg.click('.radio-card:has-text("Blank clothing")'); pg.click('text=Create project')
    pg.wait_for_selector('.workspace'); pg.wait_for_timeout(2500)

    # 1. add fill + text through the toolbox
    pg.click('button[aria-label="Add color fill"]'); pg.click('button[aria-label="Add text"]'); pg.wait_for_timeout(400)
    print('1 layers:', state(pg,'cl.designs.shirt.map(l=>l.type)'))

    # 2. drag the text in the 2D canvas (replicates the fit math)
    box = pg.locator('.design-wrap canvas').bounding_box()
    zoom = min((box['width']-56)/585,(box['height']-56)/559); ox=(box['width']-585*zoom)/2; oy=(box['height']-559*zoom)/2
    sx = lambda x: box['x']+ox+x*zoom; sy = lambda y: box['y']+oy+y*zoom
    t0 = state(pg,"(({x,y}) => [x,y])(cl.designs.shirt[1])"); print('2 text at', t0)
    pg.mouse.move(sx(t0[0]), sy(t0[1])); pg.mouse.down(); pg.mouse.move(sx(t0[0])+30, sy(t0[1])+20, steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    t1 = state(pg,"(({x,y}) => [x,y])(cl.designs.shirt[1])"); print('  moved to', [round(v,1) for v in t1], '| undo steps from drag:', state(pg,'cl.past.length'))
    # scale via corner handle
    s0 = state(pg,'cl.designs.shirt[1].size')
    pg.mouse.move(sx(t1[0]), sy(t1[1])); 
    box_w = pg.evaluate("() => 1")  # placeholder
    # corner = center + (w/2, h/2) rotated 0; approximate text bbox with measured size from canvas via layerBox
    wh = pg.evaluate("""() => { const c=document.createElement('canvas').getContext('2d'); const l=window.__nexo.clothing.getState().designs.shirt[1]; c.font=`700 ${l.size}px "Chakra Petch", Arial`; return [c.measureText(l.text).width, l.size*1.15]; }""")
    cx,cy = t1; corner=(cx+wh[0]/2, cy+wh[1]/2)
    pg.mouse.move(sx(corner[0]), sy(corner[1])); pg.mouse.down(); pg.mouse.move(sx(corner[0])+40, sy(corner[1])+30, steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    s1 = state(pg,'cl.designs.shirt[1].size'); print('  text size', round(s0,1), '->', round(s1,1))
    # rotate via handle above the box
    rot = (cx, cy - wh[1]/2 - 22)
    pg.mouse.move(sx(rot[0]), sy(rot[1])); pg.mouse.down(); pg.mouse.move(sx(cx+60), sy(cy), steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    print('  rotation', round(state(pg,'cl.designs.shirt[1].rotation'),1))

    # 3. 2D painting
    pg.keyboard.press('b'); pg.wait_for_timeout(200)
    p0 = (295-40, 100); 
    pg.mouse.move(sx(p0[0]), sy(p0[1])); pg.mouse.down(); pg.mouse.move(sx(p0[0]+60), sy(p0[1]+40), steps=10); pg.mouse.up(); pg.wait_for_timeout(300)
    print('3 paint layers:', state(pg,"cl.designs.shirt.filter(l=>l.type==='paint').map(l=>l.strokes.length+' stroke(s), '+l.strokes[0].points.length+' pts')"))

    # 4. paint straight onto the 3D model (3D only, front view)
    pg.click('.cl-bar .seg button:text-is("3D")'); pg.wait_for_timeout(500)
    pg.click('.vp-tl .seg button:text-is("Front")'); pg.wait_for_timeout(1400)
    pane = pg.locator('.cl-pane').first.bounding_box()
    cxp, cyp = pane['x']+pane['width']/2, pane['y']+pane['height']/2
    before = state(pg,"cl.designs.shirt.filter(l=>l.type==='paint').reduce((n,l)=>n+l.strokes.length,0)")
    pg.mouse.move(cxp-20, cyp-10); pg.mouse.down(); pg.mouse.move(cxp+30, cyp+15, steps=12); pg.mouse.up(); pg.wait_for_timeout(400)
    after = state(pg,"cl.designs.shirt.filter(l=>l.type==='paint').reduce((n,l)=>n+l.strokes.length,0)")
    pts = state(pg,"(() => { const l = cl.designs.shirt.filter(l=>l.type==='paint').slice(-1)[0]; const s=l.strokes[l.strokes.length-1]; return [s.points.length, s.points[0].map(Math.round), s.points[s.points.length-1].map(Math.round)]; })()")
    print('4 3D paint: strokes', before, '->', after, '| last stroke', pts)
    pg.screenshot(path='e2e-out/cl_paint3d.png', clip={'x':48,'y':84,'width':1030,'height':470})

    # 5. place on model
    pg.keyboard.press('Escape')
    tid = state(pg,"cl.designs.shirt[1].id"); pg.evaluate("(id)=>window.__nexo.clothing.getState().select(id)", tid)
    pg.keyboard.press('p'); pg.wait_for_timeout(200)
    pg.mouse.click(cxp-35, cyp-30); pg.wait_for_timeout(400)
    print('5 placed:', state(pg,"(({x,y,clip}) => [Math.round(x),Math.round(y),clip])(cl.designs.shirt[1])"))

    # 6. mirror
    pg.click('.cl-bar .seg button:text-is("Split")'); pg.wait_for_timeout(500)
    pg.keyboard.press('v')
    n0 = state(pg,'cl.designs.shirt.length')
    pg.evaluate("() => { const s=window.__nexo.clothing.getState(); const id=s.addLayer('shape',{clip:'rightArm.front'}); }"); pg.wait_for_timeout(200)
    pg.click('button:has-text("Mirror")'); pg.wait_for_timeout(300)
    print('6 mirror: layers', n0, '->', state(pg,'cl.designs.shirt.length'), '| clip', state(pg,'cl.designs.shirt.slice(-1)[0].clip'))

    # 7. undo everything back one step, redo
    u0 = state(pg,'cl.designs.shirt.length'); pg.keyboard.press('Control+z'); pg.wait_for_timeout(200); u1 = state(pg,'cl.designs.shirt.length'); pg.keyboard.press('Control+y'); pg.wait_for_timeout(200)
    print('7 undo/redo layer count', u0, u1, state(pg,'cl.designs.shirt.length'))

    # 8. export PNGs
    pg.screenshot(path='e2e-out/cl_full.png')
    pg.click('button:has-text("Export")'); pg.wait_for_selector('.export-preview img'); pg.wait_for_timeout(500)
    pg.screenshot(path='e2e-out/cl_export.png')
    with pg.expect_download() as d: pg.click('.modal-foot .btn.primary')
    path='e2e-out/'+d.value.suggested_filename; d.value.save_as(path); im=Image.open(path).convert('RGBA')
    a=im.getchannel('A'); print('8 export', d.value.suggested_filename, im.size, 'opaque px', sum(1 for v in a.getdata() if v>200), '| corner alpha', im.getpixel((0,0))[3])
    pg.click('.seg button:text-is("T-Shirt")'); pg.wait_for_timeout(300)
    with pg.expect_download() as d2: pg.click('.modal-foot .btn.primary')
    print('  tshirt:', d2.value.suggested_filename, '(empty design is blocked or exported?)')
    pg.keyboard.press('Escape')

    # 9. save + reload
    pg.keyboard.press('Control+s'); pg.wait_for_timeout(900); n = state(pg,'cl.designs.shirt.length')
    pg.reload(); pg.wait_for_selector('.home'); pg.wait_for_timeout(500)
    print('9 home card:', pg.locator('.proj-card:has-text("Interact") .hint').first.inner_text())
    pg.click('.proj-card:has-text("Interact") .proj-open'); pg.wait_for_selector('.workspace'); pg.wait_for_timeout(1800)
    print('  reopened layers:', n, '->', state(pg,'cl.designs.shirt.length'), '| screen', pg.evaluate("()=>window.__nexo.editor.getState().screen"))
    print('errors:', errs[:8] or 'none')
    b.close()
