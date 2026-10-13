# Changelog

## 1.6.0 - Import and export
- **Models keep their materials and textures.** GLB, glTF and OBJ imports are split by material: each material becomes its own part (under a group) with its colour, metalness, roughness, transparency, glow and texture. Textures are decoded once, shared between parts, scaled to 1024 px and added to the library. Pick or drop the model together with its `.mtl`, `.bin` and picture files; the model's own file names are matched. A warning names any pictures the model needed but were not provided. glTF textures are no longer upside down (V is flipped on import).
- **Upload bundle (ZIP)** for accessories: the model, a `README.md` checklist (status, triangle budget, attachment name, every validation result as a tick box, a pre-upload list), `validation-report.txt`, a project backup and a preview image.
- **Clothing export:** the preview is now the real exported PNG, decoded back from the file, with its exact size and weight. A check confirms it is exactly 585 × 559 (or 128 / 256 / 512 for T-shirts). **Upload bundle (ZIP)** adds a README with each file's upload type, size, weight, coverage and checklist.
- **Project files are versioned and validated.** Format 2 records the app version. Files from a newer version are refused with a clear message instead of being half-read. Damaged files are repaired rather than rejected: unknown shapes, missing parents, parent loops, missing textures, broken order lists, damaged images and clothing layers are fixed or dropped, and the import says what it repaired.
- **Fixed:** "Download project file" from the clothing editor left out every clothing design, so re-importing it gave an empty project. One shared serializer is now used by saving, backup and download.
- Tests: 36 new tests (project file versions and repairs, material splitting, glTF and OBJ+MTL parsing, bundles).

## 1.5.0 - Reliability
- **Save failures are loud now.** A banner appears when a project cannot be saved, with one-click **Download backup** and **Try again**. Failed saves are retried quietly in the background (8 s, 20 s, then every minute), and "this browser has no storage space left" is reported in plain words.
- **Crash-safe saving.** Data, dashboard entry and backup are written in a single database transaction, so a crash, a full disk or a closed tab can never leave a half-saved project. A rolling backup keeps the previous good version (refreshed at most every 5 minutes so it stays a real step back); restore it from the clock button on a project card. Restoring swaps the two, so it can be reversed.
- **Storage warnings.** A banner at 80% and 95% of the browser's storage quota, and when a single project grows past 25 MB. **Shrink images** scales textures to Roblox's 1024 px limit and clothing images to 1170 px, re-encoding only when it saves space (pixel art is never recompressed lossily). Big pictures are also scaled down automatically when imported.
- **Clean up unused** on the Textures and Images tabs deletes library items no part or layer uses (clothing: undoable).
- **Fixed:** undo after deleting a clothing image brought back layers pointing at a missing image. Deleting images is now part of undo history.
- **Fixed:** leaving the editor after a failed save silently lost work. It now asks first.
- **Fixed:** a blocked database open (another tab) was remembered forever, so every later save failed until reload. The database also lets go when another tab upgrades it.
- **Fixed:** removing a project used two transactions and could leave orphaned data.
- **Fixed:** pausing in the middle of a brush stroke split it into several undo steps. A stroke is one undo step.
- **Fixed:** undo/redo in the clothing editor could silently change another tab (shirt vs pants). It now switches to the tab it changed.
- **Fixed:** the offline cache could be replaced by an error page, and cached files from every deploy piled up forever. Each build has its own cache; only the current and previous are kept.
- **Fixed:** memory growth from decoded textures and painted rasters when switching projects; two success toasts on clothing import; clothing import read the dropped file twice; two overlapping saves could run together; downloads could be cut off on slow devices; OBJ parts with spaces in their names; two sample projects could be created in development.
- Tests: 38 new tests (database, rolling backup, atomic saves, session save and retry, storage levels, service worker, undo history, stroke merging).

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
