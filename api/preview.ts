import type { VercelRequest, VercelResponse } from '@vercel/node';
import { decode, catalogs } from '../src/config.js';
import { providers, tmdb, media, discoverParams } from '../server/tmdb.js';
import { prepare, cached, failure, single } from '../server/http.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!prepare(req, res)) return;
    const c = decode(single(req.query.config)),
      p = await providers(c.region);
    const row = catalogs(c, p)[0];
    if (!row) return res.json({ name: 'Sem catálogos disponíveis', items: [] });
    const provider = row.platform ? p[row.platform]?.[row.type] : undefined;
    const keys = c.platforms.length ? c.platforms : Object.keys(p);
    const ids = provider
      ? [provider.id]
      : keys.flatMap((k) => (p[k]?.[row.type] ? [p[k][row.type]!.id] : []));
    if (!ids.length) return res.json({ name: row.name, items: [] });
    const params = discoverParams(c, row.type, row.mode, ids);
    if (!params) return res.json({ name: row.name, items: [] });
    const data = await tmdb(
      row.mode === 'week'
        ? `trending/${media(row.type)}/week`
        : `discover/${media(row.type)}`,
      row.mode === 'week' ? { language: c.language } : params,
    );
    if (row.mode === 'week' && ids.length) {
      const filtered = await Promise.all(
        data.results.map(async (x: any) => {
          const offers = (
            await tmdb(`${media(row.type)}/${x.id}/watch/providers`, {}, 21600)
          ).results[c.region];
          return ['flatrate', 'free', 'ads']
            .flatMap((k) => offers?.[k] || [])
            .some((p: any) => ids.includes(p.provider_id))
            ? x
            : null;
        }),
      );
      data.results = filtered.filter(Boolean);
    }
    cached(res, 900);
    res.json({
      name: row.name,
      items: data.results
        .filter((x: any) => x.poster_path)
        .slice(0, 8)
        .map((x: any) => ({
          id: x.id,
          title: x.title || x.name,
          poster: `https://image.tmdb.org/t/p/w500${x.poster_path}`,
          year: (x.release_date || x.first_air_date || '').slice(0, 4),
          rating: x.vote_average,
        })),
    });
  } catch (e) {
    failure(res, e);
  }
}
