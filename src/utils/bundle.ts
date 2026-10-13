import JSZip from 'jszip';
import type { ClothingKind } from '../types';

/** One line of a checklist: the same shape the validation panels already produce. */
export interface BundleCheck {
  severity: 'ok' | 'info' | 'warn' | 'error';
  title: string;
  detail?: string;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const box = (c: BundleCheck) => (c.severity === 'error' || c.severity === 'warn' ? '- [ ]' : '- [x]');
const line = (c: BundleCheck) => `${box(c)} ${c.severity === 'error' ? '**Fix first:** ' : c.severity === 'warn' ? '**Check:** ' : ''}${c.title}${c.detail ? `. ${c.detail}` : ''}`;

const DOCS = 'https://create.roblox.com/docs';
const FOOTER = `Roblox's upload steps, limits and eligibility change over time, so treat this as a checklist and confirm against the Creator Docs (${DOCS}). Only upload artwork and models you have the right to use.`;

export interface AccessoryReadmeInput {
  name: string;
  format: string;
  units: string;
  merged: boolean;
  atlasSize?: number;
  attachment?: string;
  centredOnAttachment: boolean;
  parts: number;
  triangles: number;
  maxTriangles: number;
  checks: BundleCheck[];
  files: string[];
  appVersion: string;
  date: string;
}

export function accessoryReadme(i: AccessoryReadmeInput): string {
  const open = i.checks.filter((c) => c.severity === 'error' || c.severity === 'warn');
  const status = open.some((c) => c.severity === 'error') ? 'NOT ready: there are errors to fix first.' : open.length ? 'Nearly ready: review the items marked Check.' : 'All checks passed.';
  const tri = `${i.triangles.toLocaleString()} / ${i.maxTriangles.toLocaleString()} triangles`;
  return [
    `# ${i.name}: upload bundle`,
    '',
    `Made with Nexo UGC Studio ${i.appVersion} on ${i.date}.`,
    '',
    `**Status:** ${status}`,
    '',
    '## What is in this folder',
    '',
    ...i.files.map((f) => `- \`${f}\``),
    '- `validation-report.txt`: every check this tool ran',
    '- `backup/`: the project file, so you can reopen and keep editing (Home > Import project file)',
    '',
    '## The model',
    '',
    `- Format: ${i.format.toUpperCase()}, units: ${i.units}`,
    `- ${i.merged ? `One joined mesh with one ${i.atlasSize ?? 1024}px texture atlas` : `${i.parts} separate parts with their own materials`}`,
    `- Size: ${tri} (${i.parts} part${i.parts === 1 ? '' : 's'})`,
    ...(i.attachment ? [`- Suggested attachment: **${i.attachment}**${i.centredOnAttachment ? ' (the model origin is at this point)' : ''}`] : []),
    '',
    '## Checklist',
    '',
    ...(i.checks.length ? i.checks.map(line) : ['- [x] No problems found']),
    '',
    '## Before you upload',
    '',
    '- [ ] Import the model into Roblox Studio and look at it on an R6 and an R15 avatar',
    '- [ ] Run Studio\'s own validation (it is stricter than any outside tool)',
    '- [ ] Check the texture looks right and is not mirrored or upside down',
    ...(i.attachment ? [`- [ ] Confirm the Attachment is named **${i.attachment}** and sits where you want it`] : []),
    '- [ ] Pick the matching accessory type when you upload',
    '- [ ] Expect moderation: Roblox reviews every upload',
    '',
    FOOTER,
    '',
  ].join('\n');
}

export interface ClothingReadmeItem {
  kind: ClothingKind;
  file: string;
  width: number;
  height: number;
  bytes: number;
  coverage: number;
  checks: BundleCheck[];
}

const KIND_LABEL: Record<ClothingKind, string> = { shirt: 'Shirt', pants: 'Pants', tshirt: 'T-Shirt' };

export function clothingReadme(input: { name: string; items: ClothingReadmeItem[]; appVersion: string; date: string }): string {
  const all = input.items.flatMap((it) => it.checks);
  const bad = all.some((c) => c.severity === 'error');
  const warn = all.some((c) => c.severity === 'warn');
  return [
    `# ${input.name}: clothing upload bundle`,
    '',
    `Made with Nexo UGC Studio ${input.appVersion} on ${input.date}.`,
    '',
    `**Status:** ${bad ? 'NOT ready: there are errors to fix first.' : warn ? 'Nearly ready: review the items marked Check.' : 'All checks passed.'}`,
    '',
    '## Files',
    '',
    '| File | Upload as | Size | Weight | Artwork covers |',
    '| --- | --- | --- | --- | --- |',
    ...input.items.map((it) => `| \`${it.file}\` | Classic ${KIND_LABEL[it.kind]} | ${it.width} x ${it.height} px | ${formatBytes(it.bytes)} | ${Math.round(it.coverage * 100)}% of the template |`),
    '',
    ...input.items.flatMap((it) => [`## ${KIND_LABEL[it.kind]} checklist`, '', ...(it.checks.length ? it.checks.map(line) : ['- [x] No problems found']), '']),
    '## Before you upload',
    '',
    '- [ ] Try each file on an avatar first (an R6 and an R15 if you can). Roblox places R15 clothing slightly differently from this preview',
    '- [ ] On the Creator Hub choose the matching type: Shirt, Pants or T-Shirt. Not another type',
    '- [ ] Expect moderation: Roblox reviews every upload, and fees or eligibility rules may apply',
    '',
    FOOTER,
    '',
  ].join('\n');
}

export function validationReportText(name: string, checks: BundleCheck[]): string {
  const tag = { ok: 'OK   ', info: 'INFO ', warn: 'WARN ', error: 'ERROR' } as const;
  return [`Validation report for ${name}`, '', ...(checks.length ? checks.map((c) => `${tag[c.severity]} ${c.title}${c.detail ? `. ${c.detail}` : ''}`) : ['No checks were run.']), ''].join('\n');
}

export interface AccessoryBundleInput {
  /** what the exporter produced: a single file, or a ZIP (OBJ exports) whose entries are copied in */
  model: { blob: Blob; filename: string };
  readme: string;
  report: string;
  projectJson: string;
  projectName: string;
  /** data URL of an image of the model (a small viewport capture), if one could be taken */
  preview: string | null;
}

export async function buildAccessoryBundle(i: AccessoryBundleInput): Promise<Blob> {
  const zip = new JSZip();
  zip.file('README.md', i.readme);
  if (i.model.filename.endsWith('.zip')) {
    const inner = await JSZip.loadAsync(i.model.blob);
    for (const [path, entry] of Object.entries(inner.files)) {
      if (!entry.dir) zip.file(`model/${path}`, await entry.async('uint8array'));
    }
  } else {
    zip.file(`model/${i.model.filename}`, i.model.blob);
  }
  zip.file('validation-report.txt', i.report);
  zip.file(`backup/${i.projectName}.nexougc.json`, i.projectJson);
  const m = i.preview?.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (m) zip.file(`preview.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, m[2], { base64: true });
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
