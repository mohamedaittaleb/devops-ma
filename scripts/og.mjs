#!/usr/bin/env node
/**
 * Genere public/og.png a partir d'un SVG, via sharp.
 * A relancer apres tout changement de SITE.baseline : node scripts/og.mjs
 */
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

// 1200x630 : le format attendu par og:image (ratio 1.91:1).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0e0e10"/>
  <rect x="0" y="0" width="1200" height="6" fill="#a4303f"/>
  <text x="90" y="250" fill="#e9e9ec"
        font-family="SFMono-Regular, Menlo, Consolas, monospace"
        font-size="76" font-weight="650" letter-spacing="-2">devops.ma</text>
  <text x="90" y="330" fill="#9a9aa3"
        font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="34">
    Carnet technique : DevOps, DevSecOps, AI-DevOps
  </text>
  <text x="90" y="400" fill="#9a9aa3"
        font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="34">
    Labos reproductibles et mesures reelles.
  </text>
  <g font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="26" fill="#a4303f">
    <text x="90" y="530">devops</text>
    <text x="260" y="530">devsecops</text>
    <text x="500" y="530">ai-devops</text>
  </g>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(RACINE, 'public', 'og.png'));
console.log('Ecrit public/og.png (1200x630)');
