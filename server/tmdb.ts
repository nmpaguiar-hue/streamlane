import {
  platforms,
  type Config,
  type MediaType,
  type ProviderMap,
} from '../src/config.js';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Warm-instance cache is bounded and optional. CDN caching remains the primary layer.
const cache = new Map<string, { until: number; value: Promise<any> }>();
let active = 0;
const waiters: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>) {
  if (active >= 8) await new Promise<void>((r) => waiters.push(r));
  else active++;
  try {
    return await fn();
  } finally {
    const next = waiters.shift();
    if (next) next();
    else active--;
  }
}
export async function tmdb<T = any>(
  path: string,
  params: Record<string, string | number | boolean> = {},
  ttl = 3600,
): Promise<T> {
  const key = process.env.TMDB_API_KEY;
  if (!key)
    throw new HttpError(
      503,
      'Configura TMDB_API_KEY no servidor para ativar os catálogos.',
    );
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  for (const [k, v] of Object.entries(params))
    url.searchParams.set(k, String(v));
  url.searchParams.set('api_key', key);
  const cacheKey = path + JSON.stringify(params),
    old = cache.get(cacheKey);
  if (old && old.until > Date.now()) return old.value;
  const value = slot(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise((r) =>
          setTimeout(
            r,
            Math.min(
              1500,
              Number(response.headers.get('retry-after') || 0) * 1000 ||
                300 * (attempt + 1),
            ),
          ),
        );
        continue;
      }
      if (!response.ok)
        throw new HttpError(
          response.status === 404 ? 404 : 502,
          'O TMDB não respondeu. Tenta novamente dentro de instantes.',
        );
      return response.json();
    }
    throw new HttpError(502, 'TMDB temporariamente indisponível');
  });
  if (cache.size >= 2500) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, { until: Date.now() + ttl * 1000, value });
  value.catch(() => cache.delete(cacheKey));
  return value;
}
export function media(type: MediaType) {
  return type === 'series' ? 'tv' : 'movie';
}
export async function providers(region: string): Promise<ProviderMap> {
  const [movies, series] = await Promise.all(
    ['movie', 'tv'].map((type) =>
      tmdb(
        `watch/providers/${type}`,
        { watch_region: region, language: 'pt-PT' },
        86400,
      ),
    ),
  );
  const out: ProviderMap = {};
  for (const p of platforms) {
    out[p.key] = {};
    for (const [type, data] of [
      ['movie', movies],
      ['series', series],
    ] as const) {
      const match = data.results.find((r: any) =>
        p.aliases.some(
          (a) => a.toLowerCase() === r.provider_name.toLowerCase(),
        ),
      );
      if (match)
        out[p.key][type] = {
          id: match.provider_id,
          name: match.provider_name,
          logo: `https://image.tmdb.org/t/p/w92${match.logo_path}`,
        };
    }
  }
  return out;
}
export async function details(type: MediaType, id: number, language: string) {
  const d = await tmdb(
    `${media(type)}/${id}`,
    {
      language,
      append_to_response: 'external_ids,videos,images',
      include_image_language: `${language.split('-')[0]},en,null`,
    },
    86400,
  );
  if (language !== 'en-US' && (!d.overview || !(d.title || d.name))) {
    const en = await tmdb(`${media(type)}/${id}`, { language: 'en-US' }, 86400);
    d.overview ||= en.overview;
    if (type === 'movie') d.title ||= en.title;
    else d.name ||= en.name;
  }
  return d;
}
export async function external(type: MediaType, id: number) {
  return tmdb(`${media(type)}/${id}/external_ids`, {}, 604800);
}
export function dateAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}
export function discoverParams(
  c: Config,
  type: MediaType,
  mode: string,
  providerIds: number[],
) {
  const date = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const params: Record<string, string | number | boolean> = {
    language: c.language,
    watch_region: c.region,
    include_adult: false,
    sort_by: 'popularity.desc',
    [`${date}.lte`]: dateAgo(0),
  };
  if (type === 'movie') params.region = c.region;
  if (providerIds.length) {
    params.with_watch_providers = providerIds.join('|');
    params.with_watch_monetization_types = 'flatrate|free|ads';
  }
  if (mode === 'new' || mode === 'premieres') {
    params.sort_by = `${date}.desc`;
    params[`${date}.gte`] = dateAgo(mode === 'new' ? 90 : 7);
  }
  if (mode === 'rated' || mode === 'classics') {
    params.sort_by = 'vote_average.desc';
    params['vote_count.gte'] = type === 'movie' ? 300 : 100;
  }
  if (mode === 'classics') params[`${date}.lte`] = '2000-12-31';
  if (mode.startsWith('genre')) {
    const ids =
      type === 'movie' ? [28, 35, 27, 99, 16] : [10759, 35, null, 99, 16];
    const id = ids[Number(mode.slice(5))];
    if (id) params.with_genres = id;
    else return null;
  }
  return params;
}
