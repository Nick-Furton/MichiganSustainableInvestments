import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { firmGroups, type Firm } from '../data/firms';

// Logo files live in public/firms/. Their real size is read at build time, so swapping a file needs no other edit.
const DIR = join(process.cwd(), 'public', 'firms');

function intrinsic(file: string): { w: number; h: number } {
  const buf = readFileSync(join(DIR, file));
  if (file.toLowerCase().endsWith('.png')) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  const tag = buf.toString('utf8').match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const box = tag.match(/viewBox\s*=\s*["']\s*[-\d.eE]+[\s,]+[-\d.eE]+[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)/i);
  if (box) return { w: parseFloat(box[1]), h: parseFloat(box[2]) };
  const w = tag.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const h = tag.match(/\bheight\s*=\s*["']([\d.]+)/i);
  if (w && h) return { w: parseFloat(w[1]), h: parseFloat(h[1]) };
  throw new Error(`public/firms/${file}: cannot read the logo's size (an SVG needs a viewBox, or a width and height)`);
}

// Every logo is drawn at about the same visual weight: equal area, within a cap on width and on height.
const AREA = 172 * 44;
const MAX_W = 216;
const MAX_H = 64;

export type FirmTile = Firm & { src?: string; w?: number; h?: number };

function tile(f: Firm): FirmTile {
  if (!f.logo) return f;
  const { w, h } = intrinsic(f.logo);
  if (!(w > 0 && h > 0)) throw new Error(`public/firms/${f.logo}: the logo has no size`);
  const r = w / h;
  let dw = Math.sqrt(AREA * r);
  let dh = dw / r;
  const k = Math.min(1, MAX_W / dw, MAX_H / dh);
  dw *= k; dh *= k;
  return { ...f, src: `firms/${f.logo}`, w: Math.round(dw), h: Math.round(dh) };
}

export const firmWall = firmGroups.map((g) => ({ title: g.title, firms: g.firms.map(tile) }));
