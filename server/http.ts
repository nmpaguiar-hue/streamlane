import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { HttpError } from './tmdb.js';
const rates = new Map<string, { count: number; until: number }>();
export function prepare(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    throw new HttpError(405, 'Método não permitido');
  }
  // Best-effort per-instance limiter, not a distributed security boundary.
  const ip = String(
      req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown',
    ).split(',')[0],
    now = Date.now();
  let r = rates.get(ip);
  if (!r || r.until < now) {
    r = { count: 0, until: now + 60000 };
    if (rates.size >= 5000) rates.clear();
    rates.set(ip, r);
  }
  if (++r.count > 120) {
    res.setHeader('Retry-After', '60');
    throw new HttpError(429, 'Demasiados pedidos. Aguarda um minuto.');
  }
  return true;
}
export function cached(res: VercelResponse, seconds = 3600) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=60, s-maxage=${seconds}, stale-while-revalidate=86400`,
  );
}
export function origin(req: VercelRequest) {
  const base = process.env.APP_ORIGIN || `https://${req.headers.host}`;
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new HttpError(500, 'APP_ORIGIN inválida');
  return url.origin;
}
export function failure(res: VercelResponse, e: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  res
    .status(
      e instanceof HttpError
        ? e.status
        : e instanceof ZodError ||
            e instanceof SyntaxError ||
            (e instanceof Error &&
              ['Configuração inválida', 'InvalidCharacterError'].includes(
                e.message,
              ))
          ? 400
          : 502,
    )
    .json({
      error:
        e instanceof HttpError
          ? e.message
          : 'Pedido ou configuração inválidos.',
    });
}
export function single(value: unknown) {
  return typeof value === 'string' ? value : '';
}
