"""End-to-end check. Needs: pip install playwright && playwright install chromium.
Run from the repo root with the app served: npm run build && npx vite preview --port 4173
Then: python3 tests/e2e/glb-texture-orientation.py
Screenshots and downloads go to e2e-out/."""
import os
os.makedirs("e2e-out", exist_ok=True)
from playwright.sync_api import sync_playwright
import json, struct, io
from PIL import Image
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width':1366,'height':768}, accept_downloads=True); ctx.add_init_script("localStorage.setItem('nexo-tour-accessory-v1','1')")
    pg = ctx.new_page(); pg.goto('http://127.0.0.1:4173/'); pg.wait_for_selector('.home')
    pg.click('.proj-card:has-text("Cyber Crown") .proj-open'); pg.wait_for_selector('.workspace'); pg.wait_for_timeout(1500)
    for merged in (True, False):
        pg.click('button:has-text("Export")'); pg.wait_for_selector('.export-grid')
        cb = pg.locator('label:has-text("Join into one mesh") input')
        if cb.is_checked() != merged: cb.click()
        pg.click('.radio-card:has-text("GLB")')
        with pg.expect_download() as d: pg.click('.modal-foot .btn.primary')
        d.value.save_as('e2e-out/chk.glb'); raw=open('e2e-out/chk.glb','rb').read()
        jlen=struct.unpack('<I',raw[12:16])[0]; js=json.loads(raw[20:20+jlen]); buf=raw[20+jlen+8:]
        # find the first primitive that uses a textured material and compare its uv rows with the image
        for mesh in js['meshes']:
            prim=mesh['primitives'][0]; mat=js['materials'][prim['material']]
            tex=mat.get('pbrMetallicRoughness',{}).get('baseColorTexture')
            if tex is None: continue
            acc=js['accessors'][prim['attributes']['TEXCOORD_0']]; bv=js['bufferViews'][acc['bufferView']]; off=bv.get('byteOffset',0)+acc.get('byteOffset',0)
            uvs=[struct.unpack('<ff',buf[off+i*8:off+i*8+8]) for i in range(acc['count'])]
            img=js['images'][js['textures'][tex['index']]['source']]; ibv=js['bufferViews'][img['bufferView']]
            im=Image.open(io.BytesIO(buf[ibv.get('byteOffset',0):ibv.get('byteOffset',0)+ibv['byteLength']])).convert('RGBA')
            u,v=uvs[0]; px,py=int(u*im.width),int(v*im.height)   # glTF: v=0 is the TOP of the image
            print(('MERGED' if merged else 'PLAIN '), 'first vertex uv', (round(u,3),round(v,3)), '-> samples pixel', (px,py), 'rgba', im.getpixel((min(px,im.width-1),min(py,im.height-1))))
            break
        pg.keyboard.press('Escape')
    b.close()
