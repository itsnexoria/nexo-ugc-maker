# Nexo UGC Studio — by Nexoria

Browser-based Roblox UGC studio.

- **Accessories**: build hats, hair, face, back, shoulder and waist items from primitives, try them on an R6/R15 mannequin, check them against Roblox's published limits, and export **GLB / glTF / OBJ**.
- **Clothing** (new): design **Shirts, Pants and T-Shirts** with layers (fills, patterns, text, shapes, images, paint) on Roblox's classic clothing template, see them live on the 3D mannequin, paint straight onto the model, and export the **PNG** Roblox expects.

**Create. Customize. Export.**

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm test           # unit tests (store, undo/redo, validation, export)
```

Needs Node 20.19+ (Vite 8). If you are on Node 18, pin `vite@5`, `@vitejs/plugin-react@4`, `vitest@2` and `jsdom@24`. Everything runs client-side; projects are saved in the browser (IndexedDB), nothing is uploaded.

## Host it (free)

It is a static site, so any static host works. Build command `npm run build`, output folder `dist`.

- **Cloudflare Pages** — free, unlimited bandwidth, allows commercial use. Connect the repo, done. Gives you `*.pages.dev`, and a custom subdomain is free if the DNS is on Cloudflare.
- **GitHub Pages** — free for public repos. The build uses a relative base, so it works from `user.github.io/repo/` too.
- **Netlify / Vercel** — free tiers work, but Vercel's Hobby plan is non-commercial only.

Projects live in each visitor's browser per domain, so changing the domain later starts users with empty storage (they can use *Download project file* to move work).

## Clothing studio

Create a project with **New Project → Clothing**. One project holds a Shirt, Pants and T-Shirt design.

- **Template**: Roblox's classic 585 × 559 layout (shirts and pants) and the 128 × 128 T-shirt square. Panel outlines and labels can be toggled; areas Roblox ignores are dimmed and exported transparent.
- **Layers**: color fill (with gradient), patterns (stripes, checker, dots, grid, zigzag, camo), text (fonts, outline), shapes, uploaded images, and paint layers. Opacity, blend modes, lock/hide, reorder, duplicate, rename.
- **Applies to**: limit any layer to the whole template, one body part (torso, a sleeve, a leg) or a single panel, so artwork does not spill onto other sides. Bands can wrap around the torso or a sleeve.
- **Direct 3D**: the *Brush* tool paints on the template or straight onto the mannequin; *Place on model* drops the selected layer wherever you click. Strokes that cross onto another panel start a new stroke, so nothing draws across the template.
- **Mirror** copies a layer to the opposite sleeve/leg, flipped, in the right place.
- **Preview**: R6 and R15, rest/idle/walk/run/jump, shirt/pants/T-shirt shown or hidden independently.
- **Presets**: cyber jacket, hoodie, racing tee, camo, jeans, track pants, cargo, N badge, slogan and more. Presets are ordinary layers.
- **Export**: PNG per item or a ZIP of all. Shirts and pants are exactly 585 × 559; T-shirts export at 128, 256 or 512 px (drawn at 4× and downscaled).

Limits to be aware of: this is **classic** clothing only (flat template images). Layered clothing needs a cage and rig in a 3D tool and is not supported. The R15 preview is an approximation, because Roblox does its own R15 composition, so always test on an avatar before uploading. Template positions come from Roblox's Creator Docs (sizes) and DevForum UV tables (positions).

## What is real, and what is not

Implemented and tested:

- 3D viewport (Three.js / React Three Fiber): orbit, pan, zoom, grid, shadows, lighting, wireframe, camera presets, transform gizmos (move / rotate / scale) with snapping
- Primitives (cube, sphere, cylinder, cone, torus) and extra meshes (capsule, wedge, pyramid, icosphere, torus knot, arch); OBJ / GLB / glTF **import**
- 18 accessory presets (hat, crown, horns, glasses, headphones, shoulder pet, backpack, ...) that generate real geometry; save your own as assets
- Material editor with live preview, 7 presets, texture upload and library, tiling / offset / rotation
- R6 and R15 mannequins, 5 camera angles, Idle / Walk / Run / Jump placeholder animations (accessories follow their bone)
- Validation: empty scene, mesh exists, dimensions, scale, transforms, triangle budget, texture resolution, missing textures
- Real undo / redo (merges continuous edits), projects (new / open / save / duplicate / rename / delete, autosave, thumbnails), project file import/export
- Export to GLB, glTF and OBJ+MTL+textures (zip), in studs / meters / centimeters

**Not implemented (deliberately, not faked):**

- No `.rbxm` / `.rbxmx` export and no upload to Roblox. Roblox Studio and the Creator Hub finish the job: join into one mesh, bake one texture (max 1024×1024), set attachments, fit, upload.
- Animations are procedural placeholders, not Roblox animations.
- The mannequin is stylised, not Roblox's real avatar mesh.
- Texture tiling/offset is kept in GLB/glTF (KHR_texture_transform) but not in OBJ.
- The 4,000-triangle and 1024-pixel limits follow Roblox's published rigid-accessory rules at the time of writing. Roblox changes specs, so verify on create.roblox.com. The size warnings are this tool's own guidelines.

Conventions: Y up, 1 unit = 1 stud, the avatar and accessory front face **−Z** (Roblox convention).

## Build phases (easiest → hardest)

1. **Foundation** — Vite + React + TypeScript scaffold, design tokens, brand assets (logo processed for dark UI), shared types
2. **App shell & feedback UI** — top bar, toolbox, panels, tooltips, toasts, modals, confirm / prompt dialogs, context menus
3. **Projects & settings** — IndexedDB persistence, autosave, dashboard, new / open / duplicate / rename / delete, settings, themes
4. **Scene state** — editor store, hierarchy, Properties panel, layers, object CRUD
5. **3D viewport** — canvas, lights, grid, camera rig, selection box, mannequin
6. **Presets & asset library** — generated accessories, user assets, Cyber Crown sample, procedural textures
7. **Materials & textures** — material editor, live preview, texture pipeline
8. **Undo / redo & gizmos** — snapshot history with edit merging, transform controls that commit once per drag
9. **Avatar preview** — R6 / R15 rigs, procedural animations, accessories following bones
10. **Validation & export** — Roblox-oriented checks, GLB / glTF / OBJ writers, Roblox workflow notes
11. **QA** — 41 unit tests, headless-browser run through create → edit → undo → save → reload → export, 1366×768 layout pass
12. **Clothing studio** — template + UV mapping verified with labelled panels from four sides, layer renderer, 2D editor (move/scale/rotate/paint), 3D painting and place-on-model, presets, PNG export

## Layout

```
src/
  components/  shared UI (toolbox, top bar, fields, overlays, asset grid)
  panels/      properties, validation, bottom tabs, scene tree
  viewport/    Three.js scene: avatar, objects, gizmo, camera rig
  store/       zustand stores: editor (+undo), ui, settings, projects (IndexedDB)
  assets/      presets, materials, procedural textures, avatar rigs, sample project
  utils/       geometry cache, validation, exporter, math
  modals/ home/ hooks/ types/ styles/
tests/         vitest
```

## Shortcuts

Accessories: Ctrl+Z undo · Ctrl+Y redo · Ctrl+S save · Delete delete · Ctrl+D duplicate · F focus · V/W/E/R tools · G grid · X snap · L lighting · Z wireframe · 1–5 camera views · P preview · ? all shortcuts

Clothing studio: Ctrl+Z/Y undo/redo · Ctrl+S save · Ctrl+D duplicate · Delete remove layer · V select · P place on model · B brush · E eraser · T text · Space+drag pan · scroll zoom
