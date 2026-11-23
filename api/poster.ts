import type { VercelRequest, VercelResponse } from '@vercel/node';
import sharp from 'sharp';
import { z } from 'zod';
import { platforms } from '../src/config.js';
import { prepare, cached, failure } from '../server/http.js';
const schema = z
  .object({
    path: z.string().regex(/^\/[a-zA-Z0-9_-]+\.(jpg|png)$/),
    platform: z
      .enum([
        'netflix',
        'max',
        'disney',
        'apple',
        'prime',
        'sky',
        'filmin',
        'paramount',
      ])
      .optional(),
    rank: z.coerce.number().int().min(1).max(10).optional(),
    fresh: z.literal('1').optional(),
  })
  .strict();
export default async function handler(req: VercelRequest, res: VercelResponse) {
  let fallback: string | undefined;
  try {
    if (!prepare(req, res)) return;
    const q = schema.parse(req.query);
    fallback = `https://image.tmdb.org/t/p/w500${q.path}`;
    const image = await fetch(fallback, { signal: AbortSignal.timeout(8000) });
    if (!image.ok) throw new Error('Imagem indisponível');
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.length > 5000000) throw new Error('Imagem demasiado grande');
    const p = platforms.find((p) => p.key === q.platform);
    const svg = `<svg width="500" height="750" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></linearGradient></defs><rect width="500" height="750" fill="url(#g)"/>${p ? `<rect x="24" y="24" width="160" height="43" rx="15" fill="#0b0d13" fill-opacity=".9"/><circle cx="43" cy="45" r="5" fill="${p.color}"/><text x="58" y="51" font-family="DejaVu Sans,sans-serif" font-size="15" fill="white">${p.name}</text>` : ''}${q.fresh ? '<rect x="386" y="24" width="90" height="38" rx="12" fill="#bdfb72"/><text x="403" y="50" font-family="DejaVu Sans,sans-serif" font-size="22" font-weight="bold" fill="#10151e">Novo</text>' : ''}${q.rank ? `<text x="20" y="720" font-family="DejaVu Sans,sans-serif" font-size="220" font-weight="bold" fill="#10151e" stroke="#fff" stroke-width="4">${q.rank}</text>` : ''}</svg>`;
    const mask = Buffer.from(
      '<svg width="500" height="750"><rect width="500" height="750" rx="24" fill="white"/></svg>',
    );
    const out = await sharp(bytes)
      .resize(500, 750, { fit: 'cover' })
      .composite([
        { input: Buffer.from(svg) },
        { input: mask, blend: 'dest-in' },
      ])
      .png()
      .toBuffer();
    cached(res, 604800);
    res.setHeader('Content-Type', 'image/png');
    res.end(out);
  } catch (e) {
    if (fallback) {
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(302, fallback);
    } else failure(res, e);
  }
}
