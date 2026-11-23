import {
  catalogs,
  type Config,
  type MediaType,
  type ProviderMap,
} from '../src/config.js';
import {
  tmdb,
  providers,
  external,
  details,
  media,
  discoverParams,
  dateAgo,
  HttpError,
} from './tmdb.js';
export function manifest(c: Config, p: ProviderMap, origin: string) {
  return {
    id: 'pt.streamlane.catalogs',
    version: '1.0.0',
    name: 'Streamlane',
    description:
      'As tuas plataformas. Um só início. Catálogos TMDB com disponibilidade regional. Top 10 por popularidade, sem streams.',
    logo: `${origin}/logo.svg`,
    background: `${origin}/background.svg`,
    resources: [
      'catalog',
      { name: 'meta', types: c.types, idPrefixes: ['tt'] },
    ],
    types: c.types,
    idPrefixes: ['tt'],
    catalogs: catalogs(c, p).map(({ id, type, name, extra }) => ({
      id,
      type,
      name,
      extra,
    })),
    behaviorHints: { configurable: true, configurationRequired: false },
  };
}
function baseMeta(d: any, type: MediaType, imdb: string) {
  return {
    id: imdb,
    type,
    name: d.title || d.name || d.original_title || d.original_name,
    poster: d.poster_path
      ? `https://image.tmdb.org/t/p/w500${d.poster_path}`
      : undefined,
    background: d.backdrop_path
      ? `https://image.tmdb.org/t/p/original${d.backdrop_path}`
      : undefined,
    description: d.overview || undefined,
    releaseInfo: (d.release_date || d.first_air_date || '').slice(0, 4),
    imdbRating: d.vote_average ? Number(d.vote_average).toFixed(1) : undefined,
    posterShape: 'poster',
  };
}
export async function catalog(
  c: Config,
  type: MediaType,
  id: string,
  skip: number,
  origin: string,
) {
  const p = await providers(c.region),
    row = catalogs(c, p).find((x) => x.type === type && x.id === id);
  if (!row)
    throw new HttpError(
      404,
      'Catálogo indisponível nesta configuração ou região.',
    );
  if (skip % 100 !== 0 || skip > 400)
    throw new HttpError(400, 'skip deve ser 0, 100, 200, 300 ou 400.');
  if (row.mode === 'top' && skip) return { metas: [] };
  if (type === 'series' && row.mode === 'genre2') return { metas: [] }; // TMDB has no official horror TV genre.
  const provider = row.platform ? p[row.platform]?.[type] : undefined;
  const keys = c.platforms.length ? c.platforms : Object.keys(p);
  const ids = provider
    ? [provider.id]
    : keys.flatMap((k) => (p[k]?.[type]?.id ? [p[k][type]!.id] : []));
  if (!ids.length) return { metas: [] };
  const params = discoverParams(c, type, row.mode, ids);
  if (!params) return { metas: [] };
  const wanted = row.mode === 'top' ? 10 : skip + 100;
  const eligible: any[] = [];
  const seen = new Set<number>();
  // Scan from the start to preserve offsets after removing items without IMDb IDs.
  // Bound discovery to 25 TMDB pages (500 candidates), weekly trends to 5 pages.
  const maxPages = row.mode === 'week' ? 5 : 25;
  for (let page = 1; page <= maxPages && eligible.length < wanted; page++) {
    const data = await tmdb(
      row.mode === 'week'
        ? `trending/${media(type)}/week`
        : `discover/${media(type)}`,
      row.mode === 'week'
        ? { language: c.language, page }
        : { ...params, page },
      row.mode === 'top' ? 900 : 3600,
    );
    const batch = await Promise.all(
      data.results.map(async (d: any) => {
        if (seen.has(d.id) || d.adult) return null;
        seen.add(d.id);
        if (row.mode === 'week' && ids.length) {
          const availability = await tmdb(
            `${media(type)}/${d.id}/watch/providers`,
            {},
            21600,
          );
          const regional = availability.results[c.region];
          const offers = ['flatrate', 'free', 'ads'].flatMap(
            (k) => regional?.[k] || [],
          );
          if (!offers.some((x: any) => ids.includes(x.provider_id)))
            return null;
        }
        if (
          row.mode === 'week' &&
          (d.release_date || d.first_air_date || '9999') > dateAgo(0)
        )
          return null;
        try {
          const x = await external(type, d.id);
          return /^tt\d+$/.test(x.imdb_id || '')
            ? { d, imdb: x.imdb_id }
            : null;
        } catch (e) {
          if (e instanceof HttpError && e.status === 404) return null;
          throw e;
        }
      }),
    );
    eligible.push(...batch.filter(Boolean));
    if (page >= data.total_pages) break;
  }
  return {
    metas: eligible.slice(skip, wanted).map(({ d, imdb }, i) => {
      const m = baseMeta(d, type, imdb);
      if (c.posters && d.poster_path) {
        const q = new URLSearchParams({ path: d.poster_path });
        if (provider && row.platform) q.set('platform', row.platform);
        if (row.mode === 'top') q.set('rank', String(i + 1));
        if ((d.release_date || d.first_air_date || '') >= dateAgo(30))
          q.set('fresh', '1');
        m.poster = `${origin}/api/poster?${q}`;
      }
      return m;
    }),
  };
}
export async function meta(c: Config, type: MediaType, imdb: string) {
  if (!/^tt\d{5,12}$/.test(imdb)) throw new HttpError(400, 'ID IMDb inválido');
  const found = await tmdb(
    `find/${imdb}`,
    { external_source: 'imdb_id', language: c.language },
    86400,
  );
  const item = found[type === 'movie' ? 'movie_results' : 'tv_results']?.[0];
  if (!item) throw new HttpError(404, 'Título não encontrado');
  const d = await details(type, item.id, c.language),
    logo =
      d.images?.logos?.find(
        (x: any) => x.iso_639_1 === c.language.slice(0, 2),
      ) ||
      d.images?.logos?.find((x: any) => x.iso_639_1 === 'en') ||
      d.images?.logos?.[0];
  let videos = d.videos?.results || [];
  if (!videos.length && c.language !== 'en-US')
    videos = (
      await tmdb(`${media(type)}/${d.id}/videos`, { language: 'en-US' }, 86400)
    ).results;
  const result: any = {
    ...baseMeta(d, type, imdb),
    genres: d.genres?.map((g: any) => g.name),
    runtime: d.runtime ? `${d.runtime} min` : undefined,
    logo: logo ? `https://image.tmdb.org/t/p/w500${logo.file_path}` : undefined,
    trailers: videos
      .filter((v: any) => v.site === 'YouTube' && v.type === 'Trailer')
      .slice(0, 3)
      .map((v: any) => ({ source: v.key, type: 'Trailer' })),
    links: [
      {
        name: 'TMDB',
        category: 'Informação',
        url: `https://www.themoviedb.org/${media(type)}/${d.id}`,
      },
    ],
  };
  // Episode identifiers keep compatibility with stream addons: tt123:season:episode.
  if (type === 'series')
    result.videos = (
      await Promise.all(
        (d.seasons || [])
          .filter((s: any) => s.season_number > 0)
          .slice(0, 60)
          .map(async (s: any) => {
            const season = await tmdb(
              `tv/${d.id}/season/${s.season_number}`,
              { language: c.language },
              86400,
            );
            return season.episodes.map((e: any) => ({
              id: `${imdb}:${e.season_number}:${e.episode_number}`,
              title: e.name || `Episódio ${e.episode_number}`,
              season: e.season_number,
              episode: e.episode_number,
              released: e.air_date ? `${e.air_date}T00:00:00.000Z` : undefined,
              overview: e.overview,
              thumbnail: e.still_path
                ? `https://image.tmdb.org/t/p/w500${e.still_path}`
                : undefined,
            }));
          }),
      )
    ).flat();
  return { meta: result };
}
