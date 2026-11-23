import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Film,
  GripVertical,
  Layers3,
  MonitorPlay,
  MoveDown,
  MoveUp,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  catalogs,
  decode,
  defaults,
  encode,
  modes,
  platforms,
  type Config,
  type ProviderMap,
} from './config';
import './style.css';
type Preview = {
  name: string;
  items: {
    id: number;
    title: string;
    poster: string;
    year: string;
    rating: number;
  }[];
};
function initial() {
  try {
    const segment = location.pathname.split('/').filter(Boolean)[0];
    if (segment && segment !== 'configure') return decode(segment);
    const saved = localStorage.getItem('streamlane');
    return saved ? decode(saved) : defaults;
  } catch {
    return defaults;
  }
}
function App() {
  const [config, setConfig] = useState<Config>(initial),
    [providerMap, setProviderMap] = useState<ProviderMap>({}),
    [regions, setRegions] = useState([
      { code: 'PT', name: 'Portugal' },
      { code: 'ES', name: 'Espanha' },
      { code: 'GB', name: 'Reino Unido' },
      { code: 'US', name: 'Estados Unidos' },
      { code: 'BR', name: 'Brasil' },
    ]),
    [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading'),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewLoading, setPreviewLoading] = useState(false),
    [previewError, setPreviewError] = useState(''),
    [copied, setCopied] = useState(false),
    [notice, setNotice] = useState(false),
    [drag, setDrag] = useState<string | null>(null);
  const token = useMemo(() => encode(config), [config]);
  useEffect(() => {
    localStorage.setItem('streamlane', token);
  }, [token]);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setProviderMap({});
    setError('');
    fetch(`/api/providers?region=${config.region}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw new Error(
            data.error || 'Não foi possível validar as plataformas',
          );
        setProviderMap(data.providers);
        setRegions(
          data.regions.sort((a: any, b: any) =>
            a.name.localeCompare(b.name, 'pt'),
          ),
        );
        setStatus('ready');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setStatus('error');
        }
      });
    return () => controller.abort();
  }, [config.region]);
  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    if (status !== 'ready') return;
    const controller = new AbortController();
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/preview?config=${token}`, { signal: controller.signal })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          setPreview(d);
        })
        .catch((e) => {
          if (e.name !== 'AbortError')
            setPreviewError(e.message || 'Pré-visualização indisponível');
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [token, status]);
  const rows = useMemo(
    () => catalogs(config, providerMap),
    [config, providerMap],
  );
  const manifestUrl = `${location.origin}/${token}/manifest.json`;
  const installUrl = manifestUrl.replace(/^https?:\/\//, 'stremio://');
  const update = (patch: Partial<Config>) =>
    setConfig((c) => ({ ...c, ...patch }));
  function toggle(key: (typeof platforms)[number]['key']) {
    const next = config.platforms.includes(key)
      ? config.platforms.filter((x) => x !== key)
      : [...config.platforms, key];
    update({ platforms: next, ...(!next.length ? { globals: true } : {}) });
  }
  function reorder(from: string, to: string) {
    const order = rows.map((r) => `${r.type}:${r.id}`);
    const a = order.indexOf(from),
      b = order.indexOf(to);
    if (a < 0 || b < 0) return;
    order.splice(b, 0, order.splice(a, 1)[0]);
    update({ order });
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(manifestUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNotice(true);
    }
  }
  const canInstall = status === 'ready' && rows.length > 0;
  return (
    <>
      <header>
        <a href="/" className="brand">
          <img src="/logo.svg" alt="" />
          streamlane<span>para Stremio</span>
        </a>
        <a className="nav-link" href="#configuracao">
          Personalizar <ArrowUpRight size={16} />
        </a>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" />
              MENOS SCROLL. MAIS CINEMA.
            </div>
            <h1>
              O teu próximo
              <br />
              favorito está
              <br />
              <span>mesmo aqui.</span>
            </h1>
            <p>
              As plataformas que adoras, num início feito à tua medida. Dá uma
              nova perspetiva ao teu Stremio.
            </p>
            <a className="button primary hero-button" href="#configuracao">
              Criar o meu início <ArrowRight size={19} />
            </a>
            <div className="hero-foot">
              <Check size={14} /> Sem conta <span /> Sem base de dados <span />{' '}
              Feito para ti
            </div>
          </div>
          <div
            className="hero-art"
            aria-label="Ilustração conceptual de uma seleção de cinema"
          >
            <div className="orb" />
            <div className="art-label">
              <Sparkles size={13} /> A TUA PRÓXIMA SESSÃO
            </div>
            <div className="art-posters">
              <div className="art-card art-one">
                <small>UMA NOVA PERSPETIVA</small>
                <strong>
                  OUTRO
                  <br />
                  LUGAR
                </strong>
                <span>EXPLORA O EXTRAORDINÁRIO</span>
              </div>
              <div className="art-card art-two">
                <small>HISTÓRIAS QUE FICAM</small>
                <strong>
                  DEPOIS
                  <br />
                  DA LUZ
                </strong>
                <span>O CINEMA COMEÇA AQUI</span>
              </div>
              <div className="art-card art-three">
                <small>VAI MAIS LONGE</small>
                <strong>
                  SEM
                  <br />
                  LIMITES
                </strong>
              </div>
            </div>
            <div className="floating">
              <div className="floating-icon">
                <Layers3 size={20} />
              </div>
              <div>
                Todo o teu universo.<small>Um só lugar para descobrir.</small>
              </div>
              <Check size={16} />
            </div>
            <div className="concept">
              Ilustração da interface · títulos fictícios
            </div>
          </div>
        </section>
        <div className="feature-strip">
          <span>
            <Layers3 /> 8 plataformas, um só início
          </span>
          <span>
            <MonitorPlay /> Em todos os teus ecrãs
          </span>
          <span>
            <Sparkles /> Ao teu gosto, ao teu ritmo
          </span>
        </div>
        <section id="configuracao" className="workspace">
          <div className="section-heading">
            <div>
              <div className="eyebrow">O TEU STREMIO, REIMAGINADO</div>
              <h2>Escolhe o que queres descobrir.</h2>
              <p>Começa pelas plataformas. Nós organizamos a próxima sessão.</p>
            </div>
            <button className="text-button" onClick={() => setConfig(defaults)}>
              <RotateCcw size={14} /> Repor
            </button>
          </div>
          <div className="config-grid">
            <div className="settings">
              <section className="panel">
                <div className="panel-title">
                  <span className="step">01</span>
                  <h3>O teu universo</h3>
                  <span className="count">
                    {config.platforms.length} selecionadas
                  </span>
                </div>
                <div className="platform-grid">
                  {platforms.map((p) => {
                    const available = config.types.some(
                      (t) => providerMap[p.key]?.[t],
                    );
                    const active = config.platforms.includes(p.key);
                    const data =
                      providerMap[p.key]?.movie || providerMap[p.key]?.series;
                    return (
                      <button
                        key={p.key}
                        className={`platform ${active ? 'selected' : ''}`}
                        style={{ '--brand': p.color } as React.CSSProperties}
                        aria-pressed={active}
                        disabled={status === 'ready' && !available}
                        onClick={() => toggle(p.key)}
                      >
                        <div className="platform-top">
                          {data ? (
                            <img
                              className="provider-logo"
                              src={data.logo}
                              alt={data.name}
                            />
                          ) : (
                            <span className="platform-word">{p.mark}</span>
                          )}
                          <span className="toggle">
                            {active && <Check size={11} />}
                          </span>
                        </div>
                        <div className="platform-name">{p.name}</div>
                        <small>
                          {status === 'ready'
                            ? available
                              ? 'Disponível na região'
                              : 'Indisponível na região'
                            : 'Validação pendente'}
                        </small>
                      </button>
                    );
                  })}
                </div>
                {error && (
                  <div className="api-warning" role="status">
                    <strong>Os catálogos ainda não estão ligados.</strong>
                    <p>{error}</p>
                    <small>
                      A configuração visual está disponível. A instalação fica
                      ativa depois de validar as plataformas.
                    </small>
                  </div>
                )}
                {status === 'loading' && (
                  <p className="subtle" role="status">
                    A confirmar plataformas na tua região…
                  </p>
                )}
                <div className="fields">
                  <label>
                    Região
                    <div className="select-wrap">
                      <select
                        value={config.region}
                        onChange={(e) =>
                          update({ region: e.target.value, order: [] })
                        }
                      >
                        {regions.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={15} />
                    </div>
                  </label>
                  <label>
                    Idioma
                    <div className="select-wrap">
                      <select
                        value={config.language}
                        onChange={(e) =>
                          update({
                            language: e.target.value as Config['language'],
                          })
                        }
                      >
                        <option value="pt-PT">Português de Portugal</option>
                        <option value="en-US">English</option>
                        <option value="es-ES">Español</option>
                        <option value="fr-FR">Français</option>
                      </select>
                      <ChevronDown size={15} />
                    </div>
                  </label>
                </div>
                <div className="content-types">
                  <span>Quero descobrir</span>
                  <div className="segmented">
                    {[
                      { label: 'Tudo', value: ['movie', 'series'] },
                      { label: 'Filmes', value: ['movie'] },
                      { label: 'Séries', value: ['series'] },
                    ].map((o) => (
                      <button
                        key={o.label}
                        className={
                          config.types.join() === o.value.join() ? 'active' : ''
                        }
                        onClick={() =>
                          update({
                            types: o.value as Config['types'],
                            order: [],
                          })
                        }
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <span className="step">02</span>
                  <h3>A tua seleção</h3>
                </div>
                <div className="mode-grid">
                  {modes.map((m) => (
                    <button
                      key={m.key}
                      className={`mode ${config.modes.includes(m.key) ? 'active' : ''}`}
                      aria-pressed={config.modes.includes(m.key)}
                      onClick={() => {
                        const selected = config.modes.includes(m.key);
                        if (selected && config.modes.length === 1) return;
                        update({
                          modes: selected
                            ? config.modes.filter((x) => x !== m.key)
                            : [...config.modes, m.key],
                        });
                      }}
                    >
                      <span>{m.icon}</span>
                      {m.name}
                      {config.modes.includes(m.key) && <Check size={13} />}
                    </button>
                  ))}
                </div>
                <label className="check-row">
                  <div>
                    <strong>Explorar mais além</strong>
                    <small>Em alta, estreias, clássicos e géneros.</small>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.globals}
                    disabled={!config.globals && !config.platforms.length}
                    onChange={(e) => update({ globals: e.target.checked })}
                  />
                </label>
                <label className="check-row">
                  <div>
                    <strong>Posters com personalidade</strong>
                    <small>Ranking, selo da plataforma e novidades.</small>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.posters}
                    onChange={(e) => update({ posters: e.target.checked })}
                  />
                </label>
              </section>
              <section className="panel order-panel">
                <div className="panel-title">
                  <span className="step">03</span>
                  <h3>Primeiro, o que mais gostas</h3>
                </div>
                <p className="subtle">
                  Arrasta os catálogos para ordenar. No telemóvel, usa as setas.
                </p>
                <div className="order-list">
                  {rows.map((r, i) => {
                    const key = `${r.type}:${r.id}`;
                    return (
                      <div
                        className={`order-row ${drag === key ? 'dragging' : ''}`}
                        key={key}
                        draggable
                        onDragStart={() => setDrag(key)}
                        onDragEnd={() => setDrag(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (drag) reorder(drag, key);
                          setDrag(null);
                        }}
                      >
                        <GripVertical size={15} />
                        <span className="row-number">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="row-title">
                          {r.name}
                          <small>
                            {r.type === 'movie' ? 'Filmes' : 'Séries'}
                          </small>
                        </span>
                        <button
                          aria-label={`Subir ${r.name}, ${r.type}`}
                          disabled={i === 0}
                          onClick={() =>
                            reorder(
                              key,
                              `${rows[i - 1].type}:${rows[i - 1].id}`,
                            )
                          }
                        >
                          <MoveUp size={14} />
                        </button>
                        <button
                          aria-label={`Descer ${r.name}, ${r.type}`}
                          disabled={i === rows.length - 1}
                          onClick={() =>
                            reorder(
                              key,
                              `${rows[i + 1].type}:${rows[i + 1].id}`,
                            )
                          }
                        >
                          <MoveDown size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {!rows.length && (
                    <div className="empty-order">
                      Os catálogos aparecem aqui depois de validar as
                      plataformas.
                    </div>
                  )}
                </div>
              </section>
            </div>
            <aside>
              <section className="preview-panel">
                <div className="preview-heading">
                  <span>
                    <span className="live-dot" /> PRÉ-VISUALIZAÇÃO
                  </span>
                  <MonitorPlay size={17} />
                </div>
                <div className="mini-brand">
                  <img src="/logo.svg" alt="" />O teu novo início{' '}
                  <span>{config.region}</span>
                </div>
                <h3>{preview?.name || 'Histórias à tua medida'}</h3>
                <div className="poster-grid">
                  {preview?.items.length
                    ? preview.items.slice(0, 6).map((p, i) => (
                        <div className="preview-card" key={p.id}>
                          <div className="poster">
                            <img src={p.poster} alt={p.title} />
                            {config.posters &&
                              preview.name.includes('Top 10') && <b>{i + 1}</b>}
                          </div>
                          <strong>{p.title}</strong>
                          <small>
                            {p.year} <span>★ {p.rating.toFixed(1)}</span>
                          </small>
                        </div>
                      ))
                    : Array.from({ length: 6 }, (_, i) => (
                        <div className="preview-card" key={i}>
                          <div
                            className={`poster placeholder placeholder-${i} ${previewLoading ? 'loading' : ''}`}
                          >
                            <Film size={25} />
                          </div>
                          <div className="skeleton-line" />
                          <div className="skeleton-line short" />
                        </div>
                      ))}
                </div>
                <p className="preview-note">
                  {previewLoading
                    ? 'A preparar a tua seleção…'
                    : previewError ||
                      (!preview
                        ? 'Os posters reais aparecem quando a API estiver ligada.'
                        : !preview.items.length
                          ? 'Sem resultados para esta seleção.'
                          : 'Dados reais do TMDB. O aspeto final depende do cliente Stremio.')}
                </p>
                <div className="install-box">
                  <div className="install-summary">
                    <span>
                      <Layers3 size={15} />
                      {rows.length} catálogos
                    </span>
                    <span>
                      {config.types.length === 2
                        ? 'Filmes + séries'
                        : config.types[0] === 'movie'
                          ? 'Filmes'
                          : 'Séries'}
                    </span>
                  </div>
                  <a
                    className={`button primary install ${!canInstall ? 'disabled' : ''}`}
                    href={canInstall ? installUrl : undefined}
                    aria-disabled={!canInstall}
                    onClick={(e) => {
                      if (!canInstall) e.preventDefault();
                      else setNotice(true);
                    }}
                  >
                    Instalar no Stremio <ArrowUpRight size={19} />
                  </a>
                  <button
                    className="button secondary"
                    disabled={!canInstall}
                    onClick={copy}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
                    {copied ? 'URL copiado' : 'Copiar URL do manifest'}
                  </button>
                  <small>
                    A tua configuração fica guardada no URL.
                    <br />
                    Sem registo. Sem palavras-passe.
                  </small>
                  {notice && (
                    <div className="notice">
                      <button
                        aria-label="Fechar aviso"
                        onClick={() => setNotice(false)}
                      >
                        <X size={14} />
                      </button>
                      Se o Stremio não abrir, copia o URL e cola-o na área de
                      addons da aplicação.
                      <input
                        readOnly
                        value={manifestUrl}
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  )}
                </div>
              </section>
              <div className="privacy-note">
                <Check size={16} />
                <p>
                  O teu próximo favorito, sem complicações.
                  <br />
                  <span>Apenas catálogos e metadados. Sem streams.</span>
                </p>
              </div>
            </aside>
          </div>
        </section>
        <section className="how">
          <div>
            <span className="eyebrow">PRONTO PARA A PRÓXIMA SESSÃO?</span>
            <h2>
              Três passos.
              <br />
              Infinitas descobertas.
            </h2>
          </div>
          <div>
            <span>01</span>
            <h3>Escolhe</h3>
            <p>
              As plataformas, os géneros e a ordem que fazem sentido para ti.
            </p>
          </div>
          <div>
            <span>02</span>
            <h3>Instala</h3>
            <p>Um toque para adicionar os teus catálogos ao Stremio.</p>
          </div>
          <div>
            <span>03</span>
            <h3>Descobre</h3>
            <p>
              Abre o Stremio no teu dispositivo e encontra a próxima história.
            </p>
          </div>
        </section>
        <details className="transparency">
          <summary>Como são escolhidos os títulos?</summary>
          <p>
            O Top 10 usa a popularidade TMDB de títulos disponíveis na tua
            região. Não é um ranking oficial de visualizações. As tendências
            semanais são globais, filtradas pela disponibilidade regional quando
            selecionas plataformas. Novidades significa estreia recente, não
            data de entrada na plataforma. Em séries, a data é a da primeira
            estreia da série.
          </p>
          <p>
            O addon acrescenta catálogos. O Stremio controla a apresentação, a
            prioridade dos metadados e a ordem final do Board. O TMDB não dispõe
            de um género oficial de terror para séries; esse catálogo só aparece
            em filmes.
          </p>
        </details>
      </main>
      <footer>
        <a className="brand" href="/">
          <img src="/logo.svg" alt="" />
          streamlane
        </a>
        <p>Feito para descobrir mais.</p>
        <div>
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
            TMDB
          </a>
          <span>·</span>
          <a href="https://www.justwatch.com" target="_blank" rel="noreferrer">
            Disponibilidade: JustWatch
          </a>
        </div>
        <small>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB. Não afiliado ao Stremio ou às plataformas apresentadas.
        </small>
      </footer>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
