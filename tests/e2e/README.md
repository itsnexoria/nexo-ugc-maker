# End-to-end checks

These drive the built app in a real (headless) Chromium with WebGL, so they cover things unit tests cannot:
the 3D preview following edits, painting on the model, exports opening correctly, offline mode and tablet layouts.

```bash
pip install playwright && playwright install chromium
npm run build
npx vite preview --port 4173 &       # keep it running
python3 tests/e2e/accessory-workflow.py
python3 tests/e2e/clothing-interactions.py
python3 tests/e2e/split-view-sync.py          # regression: 3D must follow edits in split view
python3 tests/e2e/paint-benchmark.py          # ms per brush move (was ~105, now ~3)
python3 tests/e2e/accessory-painting.py
python3 tests/e2e/layered-export.py
python3 tests/e2e/glb-texture-orientation.py  # regression: exported UVs must sample the right texel
python3 tests/e2e/offline-and-tablet.py
python3 tests/e2e/privacy-and-touch.py
```

Each script prints what it checked. They are checks, not strict pass/fail suites: read the output.
Outputs (screenshots, exported files) land in `e2e-out/`.
