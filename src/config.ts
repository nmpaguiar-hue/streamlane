import { z } from 'zod';
export const platforms = [
  {
    key: 'netflix',
    name: 'Netflix',
    aliases: ['Netflix'],
    color: '#e50914',
    mark: 'N',
  },
  {
    key: 'max',
    name: 'HBO Max',
    aliases: ['HBO Max', 'Max'],
    color: '#5665ef',
    mark: 'HBO',
  },
  {
    key: 'disney',
    name: 'Disney+',
    aliases: ['Disney Plus', 'Disney+'],
    color: '#167ac6',
    mark: 'Disney+',
  },
  {
    key: 'apple',
    name: 'Apple TV+',
    aliases: [
      'Apple TV Plus',
      'Apple TV+',
      'Apple TV Subscription',
      'Apple TV',
    ],
    color: '#aab5c4',
    mark: 'tv+',
  },
  {
    key: 'prime',
    name: 'Prime Video',
    aliases: ['Amazon Prime Video', 'Prime Video'],
    color: '#00a8e1',
    mark: 'prime',
  },
  {
    key: 'sky',
    name: 'SkyShowtime',
    aliases: ['SkyShowtime'],
    color: '#9c65ed',
    mark: 'sky',
  },
  {
    key: 'filmin',
    name: 'Filmin',
    aliases: ['Filmin'],
    color: '#18dfb1',
    mark: 'filmin',
  },
  {
    key: 'paramount',
    name: 'Paramount+',
    aliases: ['Paramount Plus', 'Paramount+'],
    color: '#2671ff',
    mark: 'P+',
  },
] as const;
export const modes = [
  { key: 'new', name: 'Novidades', icon: '✦' },
  { key: 'top', name: 'Top 10 de hoje', icon: '↗' },
  { key: 'rated', name: 'Mais bem avaliados', icon: '★' },
  { key: 'week', name: 'Tendências da semana', icon: '◈' },
] as const;
export const configSchema = z
  .object({
    v: z.literal(1).default(1),
    region: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default('PT'),
    language: z.enum(['pt-PT', 'en-US', 'es-ES', 'fr-FR']).default('pt-PT'),
    platforms: z
      .array(
        z.enum([
          'netflix',
          'max',
          'disney',
          'apple',
          'prime',
          'sky',
          'filmin',
          'paramount',
        ]),
      )
      .max(8)
      .default(['netflix', 'max', 'disney', 'prime']),
    types: z
      .array(z.enum(['movie', 'series']))
      .min(1)
      .max(2)
      .default(['movie', 'series']),
    modes: z
      .array(z.enum(['new', 'top', 'rated', 'week']))
      .min(1)
      .max(4)
      .default(['new', 'top', 'rated', 'week']),
    globals: z.boolean().default(true),
    order: z.array(z.string().max(100)).max(100).default([]),
    posters: z.boolean().default(true),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const key of ['platforms', 'types', 'modes', 'order'] as const)
      if (new Set(c[key]).size !== c[key].length)
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Valores repetidos',
        });
    if (!c.globals && !c.platforms.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Seleciona uma plataforma ou catálogos globais',
      });
  });
export type Config = z.infer<typeof configSchema>;
export type MediaType = 'movie' | 'series';
export const defaults = configSchema.parse({});
export function encode(c: Config) {
  const s = JSON.stringify(configSchema.parse(c));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decode(s?: string) {
  if (!s) return defaults;
  if (s.length > 7000 || !/^[\w-]+$/.test(s))
    throw new Error('Configuração inválida');
  return configSchema.parse(
    JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/'))),
  );
}
export const genreNames = [
  'Ação',
  'Comédia',
  'Terror',
  'Documentário',
  'Animação',
] as const;
export type ProviderMap = Record<
  string,
  Partial<Record<MediaType, { id: number; name: string; logo: string }>>
>;
export type Catalog = {
  id: string;
  type: MediaType;
  name: string;
  extra: { name: string; isRequired: boolean }[];
  platform?: string;
  mode: string;
};
export function catalogs(c: Config, p: ProviderMap): Catalog[] {
  const rows: Catalog[] = [];
  for (const key of c.platforms)
    for (const type of c.types)
      if (p[key]?.[type])
        for (const mode of c.modes) {
          const m = modes.find((x) => x.key === mode)!;
          rows.push({
            id: `${key}.${mode}`,
            type,
            name: `${platforms.find((x) => x.key === key)!.name} · ${m.icon} ${m.name}`,
            platform: key,
            mode,
            extra: mode === 'top' ? [] : [{ name: 'skip', isRequired: false }],
          });
        }
  if (c.globals)
    for (const type of c.types)
      for (const [mode, name] of [
        ['popular', `↗ Em alta · ${c.region}`],
        ['premieres', '✦ Estreias da semana'],
        ['classics', '◆ Clássicos essenciais'],
        ...genreNames.map((g, i) => [`genre${i}`, g]),
      ]) {
        if (type === 'series' && mode === 'genre2') continue;
        rows.push({
          id: `global.${mode}`,
          type,
          name,
          mode,
          extra: [{ name: 'skip', isRequired: false }],
        });
      }
  return rows.sort((a, b) => {
    const index = (x: Catalog) => {
      const i = c.order.indexOf(`${x.type}:${x.id}`);
      return i < 0 ? 10000 : i;
    };
    return index(a) - index(b);
  });
}
