# Changelog

## 1.7.0 - Performance, clothing editor, accessories
**Performance and polish**
- The first screen is much lighter: the app's own code went from 915 kB to 222 kB (71 kB gzipped). The accessory editor, clothing editor, export, privacy, UV, reduce and fit dialogs, and the OBJ/glTF loaders now load only when used. (three.js, 676 kB, still loads at start because the editor store uses it.)
- A Web Worker for painting was *not* added: a full clothing composite measures about 2 ms in Chromium, so there is nothing to win.
- **Command palette** (Ctrl+K): type to find any command and press Enter. Every shortcut is now a command, and every command is in the palette.
- **Rebindable shortcuts:** open Keyboard shortcuts (?), click Change, press the new keys. Clashes and browser-reserved combos are refused; Reset restores the default.
- **Accessibility:** audited with axe on every screen, both themes and the dialogs: 0 violations. Fixes include tab and tree ARIA structure, page landmarks and a heading, low-contrast text, unlabeled fields, focus kept inside dialogs, and hidden items no longer shown by dimming alone.

**Clothing editor**
- **Snap and guides:** moving layers snaps to panel edges and centres, the template and other layers, with pink guide lines. Toggle with S; hold Alt to move freely.
- **Arrow keys nudge** the selection 1 px (Shift: 10 px). A held key is one undo step.
- **Layer groups (folders):** Ctrl+G / Ctrl+Shift+G or the Group button. Hide, lock and opacity apply to every layer inside; folders collapse; moving a group moves its layers; deleting it deletes them (undoable); duplicating it duplicates them.
- **Non-destructive masks:** Add mask on any layer, then the brush hides and the eraser reveals. Invert, switch off, clear or remove at any time; the layer itself is never changed.
- **Fill (magic wand)** tool (G): click an area to cover exactly that area with a new layer of the brush colour. Tolerance, connected-only and edge growth options. One undo step.
- **Text:** curve (-360 to 360 degrees), letter spacing, and 8 more bundled display fonts (Bebas Neue, Oswald, Anton, Orbitron, Press Start 2P, Permanent Marker, Pacifico, Black Ops One). Fonts load only when used.

**Accessories**
- **Mirror copy:** a mirrored copy of a part or a whole group across the centre line, faces kept pointing outward.
- **Boolean:** Join, Cut out or Keep overlap between two parts, using a real CSG engine. The originals are hidden, not deleted.
- **Reduce triangles:** a dialog with before and after wireframes and a percent slider; textures stay where they were. **Fit to 4,000 triangles** shrinks the heaviest parts until the whole accessory fits.
- **UV layout:** see where a part's triangles land on its texture, drag to move and scroll to tile it, and change the mesh's own UVs (flip, turn, fill the square, auto unwrap).
- **Attachment marker** on the avatar showing where the selected accessory attaches, named like Roblox's attachment, and moving with R6 / R15.
- Tests: 80+ new tests across commands, snapping, text, masks, fill, groups, mesh operations, UV maths and project-file repair.

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
