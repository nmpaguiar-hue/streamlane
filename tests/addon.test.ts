import sharp from 'sharp';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, encode, decode, catalogs } from '../src/config.js';
import { providers, discoverParams } from '../server/tmdb.js';
import { catalog, manifest, meta } from '../server/addon.js';
import handler from '../api/addon.js';
import poster from '../api/poster.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const originalFetch = globalThis.fetch;
process.env.TMDB_API_KEY = 'test-only-key';
const calls: string[] = [];
globalThis.fetch = async (input: any) => {
  const url = new URL(String(input));
  calls.push(url.pathname);
  const path = url.pathname.replace('/3/', '');
  let data: any;
  if (path.startsWith('watch/providers/'))
    data = {
      results: [
        {
          provider_id: 999,
          provider_name: 'Netflix',
          logo_path: '/netflix.png',
        },
        { provider_id: 777, provider_name: 'Filmin', logo_path: '/filmin.png' },
      ],
    };
  else if (path.startsWith('discover/')) {
    const page = Number(url.searchParams.get('page') || 1);
    data = {
      total_pages: 8,
      results: Array.from({ length: 20 }, (_, i) => ({
        id: (page - 1) * 20 + i + 1,
        title: `Filme ${(page - 1) * 20 + i + 1}`,
        poster_path: '/poster.jpg',
        release_date: '2020-01-01',
        overview: 'Descrição',
        vote_average: 8,
      })),
    };
  } else if (path.endsWith('/external_ids')) {
    const id = Number(path.split('/')[1]);
    data = { imdb_id: id === 1 ? null : `tt${String(id).padStart(7, '0')}` };
  } else if (path.startsWith('find/'))
    data = { movie_results: [{ id: 7 }], tv_results: [{ id: 7 }] };
  else if (path.includes('/season/'))
    data = {
      episodes: [
        {
          season_number: 1,
          episode_number: 1,
          name: 'Piloto',
          air_date: '2020-01-01',
        },
      ],
    };
  else if (path === 'tv/7')
    data = {
      id: 7,
      name: 'Série',
      overview: 'Descrição portuguesa',
      seasons: [{ season_number: 1 }],
      images: { logos: [] },
      videos: { results: [] },
      genres: [{ name: 'Drama' }],
    };
  else if (path.endsWith('/videos')) data = { results: [] };
  else if (path.endsWith('/watch/providers'))
    data = { results: { PT: { flatrate: [{ provider_id: 999 }] } } };
  else if (
    url.hostname === 'image.tmdb.org' &&
    url.pathname.endsWith('/render.jpg')
  )
    return new Response(
      new Uint8Array(
        await sharp({
          create: {
            width: 500,
            height: 750,
            channels: 3,
            background: '#334455',
          },
        })
          .jpeg()
          .toBuffer(),
      ),
    );
  else if (url.hostname === 'image.tmdb.org')
    return new Response('offline', { status: 503 });
  else throw new Error(`Unexpected ${path}`);
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
after(() => {
  globalThis.fetch = originalFetch;
  delete process.env.TMDB_API_KEY;
});
function response() {
  const headers: Record<string, string> = {};
  return {
    headers,
    code: 200,
    body: null as any,
    setHeader(k: string, v: string) {
      headers[k] = v;
      return this;
    },
    status(n: number) {
      this.code = n;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
    redirect(n: number, url: string) {
      this.code = n;
      headers.Location = url;
      return this;
    },
  };
}
test('config roundtrip and rejection of duplicates or injected fields', () => {
  assert.deepEqual(decode(encode(defaults)), defaults);
  assert.throws(() => decode('!'));
  assert.throws(() =>
    encode({ ...defaults, platforms: ['netflix', 'netflix'] }),
  );
  assert.throws(() => encode({ ...defaults, secret: 'leak' } as any));
});
test('provider IDs come from response and absent platforms stay absent', async () => {
  const p = await providers('PT');
  assert.equal(p.netflix.movie?.id, 999);
  assert.equal(p.filmin.series?.id, 777);
  assert.equal(p.paramount.movie, undefined);
  const rows = catalogs(defaults, p);
  assert(!rows.some((r) => r.platform === 'max'));
  assert(!rows.some((r) => r.type === 'series' && r.mode === 'genre2'));
});
test('discover applies regional availability, ratings threshold and release window', () => {
  const p = discoverParams(defaults, 'movie', 'rated', [999])!;
  assert.equal(p.watch_region, 'PT');
  assert.equal(p.with_watch_providers, '999');
  assert.equal(p['vote_count.gte'], 300);
  assert(
    discoverParams(defaults, 'series', 'new', [999])!['first_air_date.gte'],
  );
});
test('manifest uses configurable hint, IMDb meta resource and user order', async () => {
  const p = await providers('PT');
  const c = { ...defaults, order: ['series:netflix.rated'] };
  const m = manifest(c, p, 'https://example.com');
  assert.equal(m.catalogs[0].id, 'netflix.rated');
  assert.equal(m.catalogs[0].type, 'series');
  assert.equal(m.behaviorHints.configurable, true);
  assert.deepEqual(m.idPrefixes, ['tt']);
});
test('pagination fills 100 eligible IMDb entries after missing IDs and does not overlap', async () => {
  const first = await catalog(
    defaults,
    'movie',
    'netflix.rated',
    0,
    'https://example.com',
  );
  const second = await catalog(
    defaults,
    'movie',
    'netflix.rated',
    100,
    'https://example.com',
  );
  assert.equal(first.metas.length, 100);
  assert.equal(first.metas[0].id, 'tt0000002');
  assert.equal(second.metas[0].id, 'tt0000102');
  assert(
    !first.metas.some((m: any) => second.metas.some((n: any) => n.id === m.id)),
  );
  assert(calls.some((p) => p.includes('external_ids')));
});
test('top has at most ten entries and no second page', async () => {
  const top = await catalog(
    defaults,
    'movie',
    'netflix.top',
    0,
    'https://example.com',
  );
  assert.equal(top.metas.length, 10);
  assert(top.metas[0].poster?.includes('rank=1'));
  assert.deepEqual(
    await catalog(defaults, 'movie', 'netflix.top', 100, 'https://example.com'),
    { metas: [] },
  );
  await assert.rejects(() =>
    catalog(defaults, 'movie', 'netflix.top', 20, 'https://example.com'),
  );
});
test('series metadata provides compatible episode IDs', async () => {
  const d = await meta(defaults, 'series', 'tt0000007');
  assert.equal(d.meta.videos[0].id, 'tt0000007:1:1');
});
test('API configured routes, CORS, invalid configuration and OPTIONS', async () => {
  const req = {
    method: 'GET',
    query: { route: `${encode(defaults)}/catalog/movie/netflix.top.json` },
    headers: { host: 'example.com' },
    socket: { remoteAddress: 'test' },
  } as unknown as VercelRequest;
  const res = response();
  await handler(req, res as unknown as VercelResponse);
  assert.equal(res.code, 200);
  assert.equal(res.body.metas.length, 10);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  assert.match(res.headers['Cache-Control'], /s-maxage/);
  const bad = response();
  await handler(
    { ...req, query: { route: 'bad/manifest.json' } } as any,
    bad as any,
  );
  assert.equal(bad.code, 400);
  assert.equal(bad.headers['Cache-Control'], 'no-store');
  const options = response();
  await handler({ ...req, method: 'OPTIONS' } as any, options as any);
  assert.equal(options.code, 204);
});
test('poster rejects arbitrary URLs and redirects to original on render failure', async () => {
  const req = {
    method: 'GET',
    query: { path: 'https://internal.example/file.jpg' },
    headers: {},
    socket: { remoteAddress: 'poster' },
  } as any;
  const bad = response();
  await poster(req, bad as any);
  assert.equal(bad.code, 400);
  const fallback = response();
  await poster({ ...req, query: { path: '/valid.jpg' } }, fallback as any);
  assert.equal(fallback.code, 302);
  assert.equal(
    fallback.headers.Location,
    'https://image.tmdb.org/t/p/w500/valid.jpg',
  );
});

test('poster composition returns PNG with rounded transparency and cache', async () => {
  const req = {
    method: 'GET',
    query: { path: '/render.jpg', platform: 'netflix', rank: '1', fresh: '1' },
    headers: {},
    socket: { remoteAddress: 'render' },
  } as any;
  const res = response();
  let bytes: Buffer | undefined;
  res.end = ((data?: Buffer) => {
    bytes = data;
    return res;
  }) as any;
  await poster(req, res as any);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Content-Type'], 'image/png');
  assert(bytes);
  const info = await sharp(bytes).metadata();
  assert.equal(info.width, 500);
  assert.equal(info.height, 750);
  assert.equal(info.hasAlpha, true);
});
