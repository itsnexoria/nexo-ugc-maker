# Nexo UGC Studio — by Nexoria

Browser-based Roblox UGC accessory studio. Build accessories from primitives, try them on an R6/R15 mannequin, check them against Roblox's published limits, and export **GLB / glTF / OBJ**.

**Create. Customize. Export.**

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm test           # unit tests (store, undo/redo, validation, export)
```

Works on Node 18.19+ (tested on 18.19.1) and newer. Everything runs client-side; projects are saved in the browser (IndexedDB), nothing is uploaded.

## Host it (free)

It is a static site, so any static host works. Build command `npm run build`, output folder `dist`.

- **Cloudflare Pages** — free, unlimited bandwidth, allows commercial use. Connect the repo, done. Gives you `*.pages.dev`, and a custom subdomain is free if the DNS is on Cloudflare.
- **GitHub Pages** — free for public repos. The build uses a relative base, so it works from `user.github.io/repo/` too.
- **Netlify / Vercel** — free tiers work, but Vercel's Hobby plan is non-commercial only.

Projects live in each visitor's browser per domain, so changing the domain later starts users with empty storage (they can use *Download project file* to move work).

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
11. **QA** — 21 unit tests, headless-browser run through create → edit → undo → save → reload → export, 1366×768 layout pass

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

Ctrl+Z undo · Ctrl+Y redo · Ctrl+S save · Delete delete · Ctrl+D duplicate · F focus · V/W/E/R tools · G grid · X snap · L lighting · Z wireframe · 1–5 camera views · P preview · ? all shortcuts
