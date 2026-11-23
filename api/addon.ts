import type { VercelRequest, VercelResponse } from '@vercel/node';
import { decode, type MediaType } from '../src/config.js';
import { providers, HttpError } from '../server/tmdb.js';
import { manifest, catalog, meta } from '../server/addon.js';
import { prepare, cached, origin, failure, single } from '../server/http.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!prepare(req, res)) return;
    const route = single(req.query.route);
    if (route.length > 8000) throw new HttpError(400, 'URL demasiado longo');
    const parts = route.split('/');
    const plain = route === 'manifest.json';
    const c = decode(plain ? undefined : parts.shift());
    const base = origin(req);
    if (plain || parts.join('/') === 'manifest.json') {
      const p = await providers(c.region);
      cached(res, 21600);
      return res.json(manifest(c, p, base));
    }
    const [resource, type, id, extra] = parts;
    if (!c.types.includes(type as MediaType))
      throw new HttpError(404, 'Tipo não configurado');
    if (resource === 'catalog' && (parts.length === 3 || parts.length === 4)) {
      const catalogId = extra ? id : id.replace(/\.json$/, '');
      const suffix = extra?.replace(/\.json$/, '') || '';
      const args = new URLSearchParams(suffix);
      if (
        [...args.keys()].some((x) => x !== 'skip') ||
        args.getAll('skip').length > 1
      )
        throw new HttpError(400, 'Parâmetros não suportados');
      const raw = args.get('skip') || '0';
      if (!/^\d{1,3}$/.test(raw)) throw new HttpError(400, 'skip inválido');
      const skip = Number(raw);
      const result = await catalog(c, type as MediaType, catalogId, skip, base);
      cached(res, catalogId.endsWith('.top') ? 900 : 3600);
      return res.json(result);
    }
    if (resource === 'meta' && parts.length === 3) {
      const result = await meta(
        c,
        type as MediaType,
        id.replace(/\.json$/, ''),
      );
      cached(res, 86400);
      return res.json(result);
    }
    throw new HttpError(404, 'Rota não encontrada');
  } catch (e) {
    failure(res, e);
  }
}
