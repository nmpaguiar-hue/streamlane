import type { VercelRequest, VercelResponse } from '@vercel/node';
import { providers, tmdb, HttpError } from '../server/tmdb.js';
import { prepare, cached, failure, single } from '../server/http.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!prepare(req, res)) return;
    const region = single(req.query.region) || 'PT';
    if (!/^[A-Z]{2}$/.test(region)) throw new HttpError(400, 'Região inválida');
    const regions = await tmdb(
      'watch/providers/regions',
      { language: 'pt-PT' },
      86400,
    );
    if (!regions.results.some((r: any) => r.iso_3166_1 === region))
      throw new HttpError(400, 'Região não suportada pelo TMDB');
    const data = await providers(region);
    cached(res, 86400);
    return res.json({
      providers: data,
      regions: regions.results.map((r: any) => ({
        code: r.iso_3166_1,
        name: r.native_name || r.english_name,
      })),
      validatedAt: new Date().toISOString(),
    });
  } catch (e) {
    failure(res, e);
  }
}
