"""End-to-end check for v1.4 features. See tests/e2e/README.md for how to run."""
import os, json, struct
os.makedirs("e2e-out", exist_ok=True)
from playwright.sync_api import sync_playwright
def cl(pg, js): return pg.evaluate("() => { const cl = window.__nexo.clothing.getState(); return (%s); }" % js)
def ed(pg, js): return pg.evaluate("() => { const ed = window.__nexo.editor.getState(); return (%s); }" % js)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width':1366,'height':768}, accept_downloads=True)
    ctx.add_init_script("localStorage.setItem('nexo-tour-accessory-v1','1'); localStorage.setItem('nexo-tour-clothing-v1','1'); localStorage.setItem('nexo-perf-dismissed','1')")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:4173/?debug'); pg.wait_for_selector('.home')

    # ---------------- clothing quality of life
    pg.click('text=New Project'); pg.fill('#np-name','QoL'); pg.click('.radio-card:has-text("Cyber outfit")'); pg.click('text=Create project')
    pg.wait_for_selector('.workspace'); pg.wait_for_timeout(2000)
    n = cl(pg,'cl.designs.shirt.length')
    pg.click('.lrow >> nth=0'); pg.keyboard.down('Shift'); pg.click('.lrow >> nth=3'); pg.keyboard.up('Shift')
    print('1 shift-click range selected:', cl(pg,'cl.selectedIds.length'), 'layers | properties shows:', pg.locator('.section-head:has-text("layers selected")').inner_text())
    pg.click('.lrow >> nth=5'); pg.keyboard.down('Control'); pg.click('.lrow >> nth=6'); pg.keyboard.up('Control')
    print('  ctrl-click toggled to:', cl(pg,'cl.selectedIds.length'))
    pg.keyboard.press('Control+a'); print('  ctrl+A selects all:', cl(pg,'cl.selectedIds.length') == n)
    pg.evaluate("document.activeElement.blur()")
    pg.click('.mini-tab:has-text("History")'); pg.wait_for_timeout(200)
    print('2 history before any edit:', pg.locator('.hrow').count(), 'row (just "Start")')
    pg.click('button[aria-label="Add color fill"]'); pg.click('button[aria-label="Add text"]'); pg.wait_for_timeout(200)
    print('  after two edits:', [t.replace('\n',' ') for t in pg.locator('.hrow').all_inner_texts()])
    c0 = cl(pg,'cl.designs.shirt.length'); pg.click('.hrow:has-text("Start")'); pg.wait_for_timeout(300)
    print('  click "Start" in History: layers', c0, '->', cl(pg,'cl.designs.shirt.length'), '| future entries:', cl(pg,'cl.future.length'))
    pg.click('.hrow.ahead >> nth=-1'); pg.wait_for_timeout(300); print('  click the last entry: layers back to', cl(pg,'cl.designs.shirt.length'))
    pg.click('.mini-tab:has-text("Layers")')
    # send to pants
    pg.evaluate("() => { const s=window.__nexo.clothing.getState(); s.select(s.designs.shirt[1].id); }")
    pg.click('button[aria-label="Send layers to another item"]'); pg.click('text=Copy the whole shirt to Pants'); pg.wait_for_timeout(300)
    print('3 send-to: pants now has', cl(pg,'cl.designs.pants.length'), 'layers; clips include legs:', cl(pg,"cl.designs.pants.some(l=>/Leg/.test(l.clip))"))
    # pattern brush
    pg.keyboard.press('b'); pg.evaluate("() => window.__nexo.clothing.getState().setBrush({fillType:'pattern', pattern:'checker', patternSize:6, color:'#e3242b', color2:'#101114', size:26, hardness:1, opacity:1, symmetry:false})")
    box = pg.locator('.design-wrap canvas').bounding_box(); z = min((box['width']-56)/585,(box['height']-56)/559); ox=(box['width']-585*z)/2; oy=(box['height']-559*z)/2
    sx = lambda x: box['x']+ox+x*z; sy = lambda y: box['y']+oy+y*z
    pg.mouse.move(sx(250), sy(100)); pg.mouse.down(); pg.mouse.move(sx(340), sy(150), steps=10); pg.mouse.up(); pg.wait_for_timeout(300)
    print('4 pattern brush stroke fill:', cl(pg,"(()=>{const l=cl.designs.shirt.filter(l=>l.type==='paint').slice(-1)[0]; return l && l.strokes.slice(-1)[0].fill})()"))
    pg.screenshot(path='e2e-out/qol.png')

    # ---------------- R15 fit modal
    pg.click('button:has-text("R15 fit")'); pg.wait_for_selector('.modal'); pg.wait_for_timeout(300)
    pg.screenshot(path='e2e-out/r15fit.png')
    with pg.expect_download() as d: pg.click('text=Download test shirt and pants')
    d.value.save_as('e2e-out/r15-test.zip')
    import zipfile; print('5 R15 test pattern zip:', zipfile.ZipFile('e2e-out/r15-test.zip').namelist())
    inp = pg.locator('.modal input[type=range]').nth(1); inp.fill('80'); pg.wait_for_timeout(200)
    print('  upper limb set to 80 ->', cl(pg,'cl.r15Cal.limbUpper'), '| saved with project:', cl(pg,'JSON.stringify(cl.serialize().r15)'))
    pg.keyboard.press('Escape')

    # ---------------- performance check
    pg.click('button[aria-label="Settings"]'); pg.click('.tab:has-text("Performance")'); pg.click('text=Run performance check'); pg.wait_for_selector('text=Recommended:', timeout=20000)
    print('6 performance check:', pg.locator('.perf-box .alert').inner_text()[:140].replace('\n',' '))
    pg.keyboard.press('Escape')

    # ---------------- template import through the UI (using our own starter as the "template")
    pg.click('button:has-text("Export")'); pg.wait_for_selector('.layered-box')
    with pg.expect_download() as d2: pg.click('text=Download layered starter (GLB)')
    d2.value.save_as('e2e-out/template.glb')
    with pg.expect_file_chooser() as fc: pg.click('text=Load Roblox cage template')
    fc.value.set_files('e2e-out/template.glb'); pg.wait_for_selector('table[aria-label="Meshes in the template"]'); pg.wait_for_timeout(300)
    print('7 template meshes found:', pg.locator('table[aria-label="Meshes in the template"] tbody tr').all_inner_texts())
    with pg.expect_download() as d3: pg.click('text=Build and download (GLB)')
    d3.value.save_as('e2e-out/from-template.glb'); raw=open('e2e-out/from-template.glb','rb').read(); jl=struct.unpack('<I',raw[12:16])[0]; js=json.loads(raw[20:20+jl])
    print('  built GLB nodes:', [n['name'] for n in js['nodes'] if 'Cage' in n.get('name','') or n.get('name','').endswith('Jacket')], '| skins:', len(js['skins']), '| texture baked images:', len(js.get('images',[])))
    pg.screenshot(path='e2e-out/template-ui.png'); pg.keyboard.press('Escape')

    # ---------------- symmetry painting on accessories
    pg.click('.avatar-btn'); pg.click('text=All projects') if False else None
    pg.evaluate("() => window.__nexo.editor.getState().setScreen('home')"); pg.wait_for_selector('.home')
    pg.click('text=New Project'); pg.fill('#np-name','Sym'); pg.click('.radio-card:has-text("Blank")'); pg.click('text=Create project'); pg.wait_for_selector('.workspace'); pg.wait_for_timeout(1500)
    pg.click('button[aria-label="Add Hat"]'); pg.click('.picker .asset-card:has-text("Horns")'); pg.wait_for_timeout(500)
    pg.click('.vp-tl .seg button:text-is("Front")'); pg.wait_for_timeout(1200)
    pg.evaluate("() => { const e=window.__nexo.editor.getState(); e.setTransform(e.selectedId,{scale:[3,3,3]}); }"); pg.wait_for_timeout(300)
    pg.keyboard.press('b'); pg.wait_for_timeout(200)
    pg.locator('.section:has-text("Paint") [aria-label="Symmetry painting"]').click(); pg.wait_for_timeout(200)
    pt = pg.evaluate("""() => { const {editor, viewport} = window.__nexo; const e=editor.getState(); const left=Object.values(e.objects).find(o=>o.name==='Left Horn');
      const g=viewport.registry.get(left.id); const v=g.position.clone(); g.getWorldPosition(v); const p=v.project(viewport.camera); const r=viewport.gl.domElement.getBoundingClientRect();
      return [r.left+(p.x+1)/2*r.width, r.top+(1-p.y)/2*r.height]; }""")
    pg.mouse.move(pt[0]-6, pt[1]+10); pg.mouse.down(); pg.mouse.move(pt[0]+6, pt[1]-10, steps=10); pg.mouse.up(); pg.wait_for_timeout(500)
    res = ed(pg,"Object.values(ed.objects).filter(o=>o.paint).map(o=>o.name+':'+o.paint.strokes.length+' stroke(s)')")
    print('8 symmetry painting painted:', res, '| one undo step:', ed(pg,'ed.past.length'), 'entries')
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    print('  after one undo, painted parts:', ed(pg,"Object.values(ed.objects).filter(o=>o.paint).length"))
    pg.screenshot(path='e2e-out/symmetry.png', clip={'x':48,'y':84,'width':1030,'height':470})
    print('errors:', errs[:6] or 'none'); b.close()
