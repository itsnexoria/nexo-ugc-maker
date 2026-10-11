# Changelog

## 1.4.0
- Clothing: multi-select with box select, group move/edit/duplicate/delete and alignment; History tab with click-to-jump; pattern and gradient brushes; Send to (shirt layers to pants and back).
- R15: adjustable segment split saved with the project and a numbered test pattern for checking against a real avatar.
- Layered clothing: build from Roblox's own cage template (FBX/GLB/glTF) keeping the template cage's vertices, UVs and skin, with the classic design baked onto the cage UVs. Untested against Roblox's real files.
- Accessories: symmetry painting across the accessory's centre line, one undo step per stroke.
- Test fit: skin tones, body scaling, sample outfits and headwear for both editors.
- Performance check with a quality recommendation, an adaptive slow-device suggestion, and touch polish.

## 1.3.0
- **Fixed:** in split view the 3D clothing preview did not follow edits (the 2D editor redrew the shared canvas first, so the 3D texture was never flagged for upload). Each texture now tracks the version it last uploaded.
- **Fixed:** exported GLB textures were vertically flipped relative to their UVs (the merged atlas pointed parts at the wrong cells). The exporter now flips the image the way three.js UVs expect.
- **Fixed:** a brush stroke took two undo steps; it is now one, in both editors.
- Painting is ~30x faster on a loaded document (105 ms to ~3 ms per move): per-layer raster cache, incremental paint canvases, batched pointer input, rate-limited GPU uploads, cheaper checkerboard, quality-aware previews.
- Accessory texture painting: paint directly on parts, 128/256/512 px per part, unwrapped UVs, included in all exports and the merged atlas.
- Layered clothing starter (beta): R15-skinned garment + placeholder inner/outer cages + design texture, plus a puffiness preview. Not upload-ready; needs Roblox's cage templates.
- Offline mode and installable app, Privacy and your data panel (backup all, ask for persistent storage, delete everything), tablet layout with a drawer panel, touch pinch-zoom on the template, phone message.
- Tests: 69 unit tests and a set of browser checks in `tests/e2e`.

## 1.2.0
- Clothing: import an existing shirt/pants/T-shirt PNG; soft, translucent and symmetric brush with recent colors and an eyedropper; drag to reorder layers; R15 mapping now follows the documented 64/48/16 px limb split, with joint lines drawn on the template; readable panel labels on light designs.
- Accessories: join all parts into one mesh with one baked texture atlas (512/1024); origin at the attachment point; suggested Roblox attachment names; per-part low-poly detail and a one-click triangle reducer.
- Housekeeping: guided tour for both editors, crash recovery screen with project backup, copyable diagnostics (no telemetry), unhandled-rejection logging.

## 1.1.0
- Clothing studio: shirts, pants and T-shirts on Roblox's classic templates with layers, presets, 3D painting, place-on-model, mirror and PNG export.

## 1.0.0
- Accessory studio: viewport, presets, materials, textures, validation, GLB/glTF/OBJ export, projects.
