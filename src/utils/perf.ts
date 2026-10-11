import type { Quality } from '../store/settings';
import { drawLayers } from '../clothing/render';
import { CLOTHING_PRESETS } from '../clothing/presets';
import { IncrementalPaint } from './strokePaint';
import { viewportApi } from '../viewport/api';

/**
 * Quick, honest device check: how fast can this machine draw a typical clothing design and a brush stroke,
 * how smooth is the page right now, and is the GPU real or software-emulated? Everything runs locally.
 */
export interface PerfReport {
  gpu: string;
  software: boolean;
  cores: number | null;
  memoryGb: number | null;
  fps: number;
  compositeMs: number;
  brushMs: number;
  recommended: Quality;
  reasons: string[];
  touch: boolean;
}

const SOFTWARE = /swiftshader|llvmpipe|software|basic render|softpipe|microsoft basic/i;

export function gpuName(): string {
  try {
    const gl = viewportApi.gl?.getContext() ?? document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (!gl) return 'No WebGL available';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'Hidden by the browser';
  } catch {
    return 'Unknown';
  }
}

function measureFps(ms: number): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    let last = performance.now();
    let slow = 0;
    const start = last;
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      if (dt < 250) {
        frames += 1;
        slow += dt;
      }
      if (t - start >= ms) resolve(slow > 0 ? (frames / slow) * 1000 : 0);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function time(fn: () => void, runs: number): number {
  fn(); // warm up
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - t0) / runs;
}

export async function runPerfCheck(): Promise<PerfReport> {
  const gpu = gpuName();
  const software = SOFTWARE.test(gpu);
  const nav = navigator as Navigator & { deviceMemory?: number };

  // 1. flattening a realistic design (cyber jacket, 12 layers) from scratch
  const jacket = CLOTHING_PRESETS.find((p) => p.id === 'shirt-cyber')!;
  const c = document.createElement('canvas');
  c.width = 585;
  c.height = 559;
  const ctx = c.getContext('2d');
  let compositeMs = 0;
  let brushMs = 0;
  if (ctx) {
    compositeMs = time(() => drawLayers(ctx, 'shirt', jacket.build(), { getImage: () => null, version: 0 }, 1), 8);
    // 2. one soft, translucent brush move on a surface that already has 40 strokes
    const strokes = Array.from({ length: 40 }, (_, i) => ({ color: '#222', size: 8, erase: false, hardness: 0.4, alpha: 0.6, points: Array.from({ length: 24 }, (_, k) => [100 + k * 3, 80 + i * 3 + Math.sin(k) * 4] as [number, number]) }));
    const ip = new IncrementalPaint();
    let n = 0;
    const live = { color: '#e00', size: 16, erase: false, hardness: 0.3, alpha: 0.5, points: [[200, 200]] as [number, number][] };
    ip.render([...strokes, live], 585, 559, 1);
    brushMs = time(() => {
      n += 1;
      const next = { ...live, points: [...live.points, [200 + n * 1.5, 200 + Math.sin(n / 5) * 20] as [number, number]] };
      live.points = next.points;
      ip.render([...strokes, next], 585, 559, 1);
    }, 40);
  }
  // 3. how smoothly the page itself is drawing right now
  const fps = await measureFps(1200);

  const reasons: string[] = [];
  let level = 2; // 0 low, 1 medium, 2 high
  const lower = (to: number, why: string) => {
    if (to < level) level = to;
    reasons.push(why);
  };
  if (software) lower(0, `The graphics are emulated in software (${gpu}), which is slow for 3D.`);
  if (fps && fps < 28) lower(0, `The page runs at about ${fps.toFixed(0)} frames per second.`);
  else if (fps && fps < 50) lower(1, `The page runs at about ${fps.toFixed(0)} frames per second, below a smooth 60.`);
  if (compositeMs > 25) lower(0, `Drawing a full design takes ${compositeMs.toFixed(0)} ms.`);
  else if (compositeMs > 10) lower(1, `Drawing a full design takes ${compositeMs.toFixed(0)} ms.`);
  if (brushMs > 12) lower(0, `A soft brush move takes ${brushMs.toFixed(1)} ms.`);
  else if (brushMs > 6) lower(1, `A soft brush move takes ${brushMs.toFixed(1)} ms.`);
  if (nav.deviceMemory && nav.deviceMemory <= 2) lower(0, `The browser reports only ${nav.deviceMemory} GB of memory.`);
  if (!reasons.length) reasons.push('Everything measured fast.');
  return {
    gpu,
    software,
    cores: navigator.hardwareConcurrency ?? null,
    memoryGb: nav.deviceMemory ?? null,
    fps,
    compositeMs,
    brushMs,
    recommended: (['low', 'medium', 'high'] as Quality[])[level],
    reasons,
    touch: matchMedia?.('(pointer: coarse)').matches ?? false,
  };
}

export function formatPerfReport(r: PerfReport): string {
  return [
    `Nexo UGC Studio performance check`,
    `GPU: ${r.gpu}${r.software ? ' (software)' : ''}`,
    `CPU cores: ${r.cores ?? '?'}, memory: ${r.memoryGb ? r.memoryGb + ' GB' : '?'}, touch: ${r.touch ? 'yes' : 'no'}`,
    `Page frame rate: ${r.fps.toFixed(0)} fps`,
    `Full design redraw: ${r.compositeMs.toFixed(1)} ms`,
    `Soft brush move: ${r.brushMs.toFixed(1)} ms`,
    `Recommended quality: ${r.recommended}`,
    ...r.reasons.map((x) => `- ${x}`),
  ].join('\n');
}
