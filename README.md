# Streamlane

As tuas plataformas. Um só início.

Addon configurável de catálogos para Stremio, em TypeScript, com página de instalação React, TMDB e funções Node.js na Vercel. Só fornece catálogos e metadados. Não fornece streams.

## 1. Arquitetura e limites

A interface React é compilada por Vite para ficheiros estáticos. Os endpoints do protocolo são implementados diretamente em `api/addon.ts`, sem Express e sem `.listen()`. `vercel.json` encaminha os URLs públicos. Zod valida configurações codificadas em base64url. A chave TMDB existe exclusivamente no servidor.

Fluxo: configuração → URL personalizado → manifest → pedidos de catálogo → TMDB → conversão para IMDb → Stremio. O endpoint de posters usa Sharp e aceita apenas caminhos de imagens TMDB validados; não aceita URLs arbitrários.

O addon pode acrescentar linhas ao Board e catálogos ao Discover, dar nomes e propor uma ordem. Não pode substituir a interface, remover Cinemeta, controlar animações do Stremio nem garantir a ordem final do Board. Isso depende do cliente e da ordem dos addons. Para privilegiar estes catálogos, utiliza as opções de organização que a tua versão disponibiliza. Os metadados podem ser servidos por outro addon com prioridade superior.

### Sem rankings inventados

| Catálogo             | Critério implementado                                                               |
| -------------------- | ----------------------------------------------------------------------------------- |
| Novidades            | Estreias dos últimos 90 dias, disponíveis na plataforma e região                    |
| Top 10 de hoje       | Até dez títulos, ordenados por `popularity.desc`, com cache de 15 minutos           |
| Mais bem avaliados   | `vote_average.desc`, mínimo de 300 votos em filmes e 100 em séries                  |
| Tendências da semana | Trending global TMDB da semana, filtrado por disponibilidade na região e plataforma |
| Em alta              | Popularidade entre títulos disponíveis nas plataformas selecionadas na região       |
| Estreias da semana   | Primeira estreia nos últimos sete dias e disponibilidade atual                      |
| Clássicos essenciais | Títulos anteriores a 2001, ordenados por avaliação com mínimo de votos              |
| Géneros              | Ação, Comédia, Terror, Documentário e Animação; Terror apenas em filmes             |

O TMDB não fornece um ranking oficial diário de visualizações por plataforma em Portugal. O nome Top 10 de hoje designa uma aproximação baseada em popularidade atual. Trending é global, não um ranking calculado só com utilizadores portugueses. `watch_region` filtra disponibilidade, não a origem dos votos/popularidade.

A API também não fornece uma data fiável de entrada em cada plataforma. Novidades significa estreia recente. Em séries usa a primeira estreia da série, não novos episódios ou temporadas. Os dados de disponibilidade podem estar desatualizados.

As plataformas são Netflix, HBO Max/Max, Disney+, Apple TV+, Amazon Prime Video, SkyShowtime, Filmin e Paramount+. Nenhum ID é fixo. São consultados separadamente `/watch/providers/movie` e `/watch/providers/tv`, com `watch_region=PT`. Os nomes são conciliados com uma lista explícita de aliases, sem confundir canais adicionais com a subscrição principal. Plataformas ausentes na região ficam desativadas. Não se substitui Paramount+ por SkyShowtime. Uma mudança de nome no TMDB pode exigir atualizar os aliases.

**A validação real dos IDs PT necessita de TMDB_API_KEY. O projeto não contém uma lista alegadamente validada sem credenciais.** Depois de configurar a chave, `/api/providers?region=PT` mostra IDs, nomes e os logótipos oficiais devolvidos pelo TMDB.

Os posters decorados têm o nome da plataforma como selo tipográfico, um número nos Top 10 e Novo quando a estreia foi nos últimos 30 dias. Os logótipos de plataformas na configuração vêm do TMDB. O selo tipográfico evita descarregar e recompor marcas em cada imagem. Há redirecionamento para o poster original se a composição falhar.

### Cache e proteção

| Recurso   | Cache CDN  |
| --------- | ---------- |
| Providers | 24 horas   |
| Manifest  | 6 horas    |
| Catálogos | 1 hora     |
| Top 10    | 15 minutos |
| Metadados | 24 horas   |
| Posters   | 7 dias     |

Os handlers enviam `Cache-Control: public, max-age=60, s-maxage=..., stale-while-revalidate=86400`. Erros têm `no-store`. O CDN da Vercel pode retirar `s-maxage` da resposta enviada ao navegador; verifica também `x-vercel-cache`.

Existe cache auxiliar em memória, limitado a 2500 entradas, com deduplicação de pedidos em curso. Não é persistente nem partilhado entre instâncias. A concorrência TMDB é limitada a oito pedidos por instância. Pedidos que recebem 429/5xx têm até duas novas tentativas, com pausa limitada e timeout. O rate limiter permite até 120 pedidos/minuto/IP/instância, serve apenas como proteção básica. Para produção com tráfego elevado, configura regras no Vercel Firewall ou um rate limiter distribuído.

### Paginação

O protocolo de catálogo usa páginas de 100 itens. Cada página agrega várias páginas TMDB de 20 itens. O addon remove candidatos sem IMDb, volta a percorrer a seleção e preenche a página com até 100 IDs válidos antes de aplicar o offset. Assim, um título sem IMDb não faz saltar silenciosamente as páginas seguintes. Aceita `skip=0`, `100`, `200`, `300`, `400`. Pesquisa até 25 páginas TMDB, ou 500 candidatos. Não é uma exportação ilimitada do TMDB. Tendências pesquisa até cinco páginas, ou 100 candidatos, e pode terminar mais cedo. Top 10 tem até dez itens, sem paginação.

Resultados podem mudar entre pedidos se o ranking TMDB mudar. Não existe snapshot persistente nem promessa de paginação imutável durante várias horas. A primeira página com cache frio pode gerar dezenas de pedidos `external_ids`; por isso estão definidos limite de concorrência, cache e duração de função de 60 segundos. Mede o tráfego real antes de abrir a instalação a uma comunidade grande.

Metadados de séries carregam até 60 temporadas e identificadores `tt1234567:temporada:episódio`. Géneros, sinopse, imagens, trailers YouTube e logo do título são incluídos quando o TMDB os disponibiliza. Sinopses em falta usam inglês. O campo `imdbRating` é a avaliação TMDB, porque este é o campo de apresentação do protocolo Stremio; não representa votos obtidos no IMDb.

## 2. Estrutura completa

```text
streamlane/
├── .env.example
├── .github/workflows/ci.yml
├── .gitignore
├── .prettierignore
├── .prettierrc.json
├── api/
│   ├── addon.ts
│   ├── poster.ts
│   ├── preview.ts
│   └── providers.ts
├── public/
│   ├── background.svg
│   └── logo.svg
├── scripts/providers.ts
├── server/
│   ├── addon.ts
│   ├── http.ts
│   └── tmdb.ts
├── src/
│   ├── config.ts
│   ├── main.tsx
│   └── style.css
├── tests/addon.test.ts
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── tsconfig.json
├── vercel.json
└── vite.config.ts
```

`CODIGO_COMPLETO.md`, quando entregue em conjunto, agrega todos os ficheiros de texto e o lockfile, sem omissões. O código utilizável está também separado nas pastas indicadas. O lockfile fixa as versões instaladas; usa `npm ci`.

## 3. Código

Todos os ficheiros completos estão no repositório e no ZIP. O documento `CODIGO_COMPLETO.md` apresenta cada um integralmente, em blocos para copiar, incluindo configurações, testes e workflow. Não é necessário reconstruir o projeto a partir da conversa.

## 4. Configuração

Variáveis:

```dotenv
TMDB_API_KEY=
APP_ORIGIN=
```

`TMDB_API_KEY` recebe a chave API v3 do TMDB, não o token Bearer v4. Nunca uses prefixos `VITE_` para esta chave. Não a coloques no URL de instalação. `APP_ORIGIN` é opcional: o domínio HTTPS público sem caminho, útil se quiseres manter URLs de imagens no domínio principal. Quando não está definido, usa o host recebido pela Vercel. Para desenvolvimento com HTTP local, define `APP_ORIGIN=http://localhost:3000`.

A configuração base64url **não está encriptada**. Só contém plataformas, região, idioma, tipos, modos, ordem e preferência de posters. Não contém segredos. O browser conserva uma cópia em localStorage para facilitar a edição; o servidor não necessita de base de dados. URLs criados pelo frontend são validados por Zod em ambos os lados. Alterar preferências cria outro URL, sendo necessário reinstalar/substituir a configuração no Stremio.

Endpoints públicos:

```text
GET /manifest.json
GET /:config/manifest.json
GET /:config/catalog/movie/netflix.new.json
GET /:config/catalog/movie/netflix.new/skip=100.json
GET /:config/catalog/series/netflix.rated.json
GET /:config/meta/movie/tt0133093.json
GET /:config/meta/series/tt0944947.json
GET /api/providers?region=PT
GET /api/preview?config=BASE64URL
GET /api/poster?path=CAMINHO_TMDB&platform=netflix&rank=1&fresh=1
GET /
GET /configure
GET /:config/configure
```

Os exemplos `:config`, `BASE64URL` e `CAMINHO_TMDB` explicam o formato; o botão Copiar URL cria valores reais. Todas as rotas JSON devolvem CORS. As imagens devolvem `image/png` ou redirecionam para o original. As páginas devolvem HTML. Os handlers aceitam OPTIONS e rejeitam outros métodos.

## 5. Deploy, do princípio ao fim

### Obter a chave gratuita TMDB

1. Num computador, abre https://www.themoviedb.org/signup e cria uma conta, se ainda não tiveres.
2. Abre https://www.themoviedb.org/settings/api.
3. Pede uma chave para utilização de desenvolvimento e preenche os dados verdadeiros do projeto. Lê e aceita os termos na tua conta. A API de desenvolvimento destina-se a utilização não comercial; confirma o enquadramento se houver receitas.
4. Copia a API Key v3. Guarda-a apenas nas variáveis do servidor. Não a publiques em issues ou commits.
5. Mantém a atribuição TMDB e JustWatch. O rodapé já identifica as fontes. Confirma os requisitos atuais de marca e utilização antes de uma divulgação pública alargada.

### Instalar ferramentas

Instala Node.js 22 LTS, Git e, opcionalmente, GitHub CLI pelas fontes oficiais. Abre o terminal dentro da pasta do projeto.

```bash
node --version
npm --version
git --version
npm ci
cp .env.example .env.local
```

No Windows PowerShell usa `Copy-Item .env.example .env.local` em vez de `cp`, se necessário. Abre `.env.local` no editor e preenche a chave. Depois:

```bash
npm run providers
npm run lint
npm test
npm run build
npm run dev
```

`npm run dev` usa Vercel Dev para as funções e a interface; segue as instruções de associação ao projeto. `npm run dev:ui` serve só a página e não disponibiliza os endpoints TMDB. Não confundas essa pré-visualização com o addon completo.

### Primeiro repositório e commit

Se estiveres a usar o repositório já criado para este projeto, faz clone e segue diretamente para o passo Vercel:

```bash
git clone https://github.com/nmpaguiar-hue/streamlane.git
cd streamlane
npm ci
```

Para criar uma cópia independente, cria um repositório vazio no GitHub. Se tiveres a CLI:

```bash
gh auth login
git init
git branch -M main
git add .
git commit -m "feat: criar Streamlane para Stremio"
gh repo create streamlane --public --source=. --remote=origin --push
```

Alternativa sem GitHub CLI: cria o repositório em https://github.com/new sem README inicial, copia o endereço HTTPS que o GitHub apresenta e executa:

```bash
git init
git branch -M main
git add .
git commit -m "feat: criar Streamlane para Stremio"
git remote add origin https://github.com/TEU_UTILIZADOR/streamlane.git
git push -u origin main
```

Substitui apenas `TEU_UTILIZADOR` pelo teu nome real de conta nesse exemplo. `.gitignore` exclui `.env.local` e outros segredos. Antes de publicar usa `git status` para confirmar.

### Importar na Vercel

1. Abre https://vercel.com/new e seleciona o repositório Streamlane.
2. Se não aparecer, dá à integração GitHub da Vercel acesso ao repositório na tua conta.
3. Framework: Vite. Root Directory: raiz. Build Command: `npm run build`. Output Directory: `dist`. Node.js: 22.x. O `vercel.json` já contém as rotas e duração das funções.
4. Em Environment Variables adiciona `TMDB_API_KEY` com a chave v3, para Production e Preview. Adiciona-a a Development se usares Vercel Dev associado. Marca-a como sensível quando essa opção estiver disponível.
5. Faz Deploy. Se adicionares/alterares a chave depois de um deploy, faz Redeploy.
6. A página e os endpoints do addon têm de estar acessíveis publicamente, sem a página de autenticação de Deployment Protection. Usa o domínio de produção, não um preview protegido. Se a tua configuração de conta proteger produção, revê essa definição conscientemente na Vercel.
7. Opcional: adiciona `APP_ORIGIN` com o domínio definitivo, depois de o conheceres. Faz Redeploy.

### Validar sem Stremio

Abre `/api/providers?region=PT`. Deves receber uma lista real, com IDs por tipo. A ausência de Paramount+ ou de outra plataforma é um resultado válido: não inventes um ID.

Abre `/manifest.json`. Confirma `id`, `resources`, `catalogs` e `behaviorHints.configurable`. Na landing page escolhe plataformas e copia o manifest personalizado. Num terminal:

```bash
curl -i https://TEU_DOMINIO/manifest.json
curl -i 'https://TEU_DOMINIO/api/providers?region=PT'
```

Substitui `TEU_DOMINIO` pelo domínio real. Para testar um catálogo e paginação, parte do URL personalizado copiado e troca o final `manifest.json` por `catalog/movie/netflix.rated.json` e por `catalog/movie/netflix.rated/skip=100.json`. Só usa Netflix se o provider existir na região. Confirma IDs `tt...`, `Access-Control-Allow-Origin: *`, `application/json` e cache. Testa um poster e o mesmo pedido uma segunda vez para observar o CDN.

O teste automatizado usa respostas TMDB simuladas com IDs arbitrários para provar que os IDs não são assumidos pelo código. **Não valida disponibilidade real ou integração autenticada.** Sem chave, o servidor responde 503 e a landing page explica o passo em falta. Não apresenta posters fictícios como dados TMDB nem permite instalar uma seleção ainda não validada.

### Instalar nos dispositivos

| Dispositivo            | Procedimento                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop                | Abre a landing page, configura e toca em Instalar no Stremio. Confirma na aplicação. Se o deep link não abrir, usa Copiar URL e a opção de adicionar addon por URL do cliente.                                        |
| Android                | Abre a landing no navegador e usa Instalar no Stremio. Pode ser preciso permitir abrir ligações na app.                                                                                                               |
| Web                    | Usa Copiar URL e adiciona o manifest na área de addons do cliente web que utilizas. O deep link pode abrir a aplicação nativa em vez do navegador.                                                                    |
| Android TV / Google TV | Instala primeiro no desktop/telemóvel com a mesma conta Stremio. Depois abre/sincroniza essa conta na TV.                                                                                                             |
| Outras TVs / iOS       | A disponibilidade da app e os métodos de instalação variam. Usa a mesma conta num cliente compatível para instalar e verifica a sincronização. Não é necessário nem possível instalar código serverless dentro da TV. |

O addon não desbloqueia subscrições e não reproduz vídeo por si. Os IDs IMDb ajudam outros addons compatíveis a reconhecer os títulos, sem fornecer fontes de vídeo.

### Atualizações automáticas

Com o repositório ligado ao projeto Vercel, cada push para `main` desencadeia o deploy de produção; PRs podem gerar previews. O workflow CI valida código, testes e build. Por predefinição, um deploy Vercel não espera necessariamente que todos os checks GitHub passem. Para exigir isso, configura os deployment checks/proteções adequados na tua conta.

```bash
git pull --ff-only
npm ci
npm run lint
npm test
npm run build
git add .
git commit -m "feat: melhorar catálogos e configuração"
git push origin main
```

Mantém o domínio e o ID do manifest para atualizações transparentes. Incrementa a versão em `package.json` e `server/addon.ts`. Se alterares as preferências, copia/instala o novo URL. O Stremio e o CDN podem manter caches até ao seu prazo expirar.

### Domínio personalizado opcional

Em Project → Settings → Domains adiciona um domínio que controles e segue os registos DNS exatos que a Vercel indicar. Aguarda validação e HTTPS. Atualiza `APP_ORIGIN` e reinstala o URL com o novo domínio. A compra de domínio não faz parte do projeto. Evita usar nomes/marcas de plataformas no domínio de forma que sugira uma aplicação oficial.

## 6. Melhorias futuras

1. Trakt via OAuth para recomendações e histórico, com armazenamento seguro de tokens. Continuar a ver necessita de dados e suporte do cliente; não aparece automaticamente por acrescentar um catálogo.
2. Recomendações por géneros e moods sem autenticação, ou perfis pessoais mediante consentimento.
3. Rate limiting distribuído, cache partilhada e pré-aquecimento dos catálogos mais usados.
4. Snapshot diário dos rankings e paginação estável com cursor interno.
5. Feed de novos episódios e temporadas, distinto da primeira estreia da série.
6. Escolha individual de catálogos, seleção de géneros e presets por perfil.
7. Traduções mais completas dos títulos e descrições de episódios quando pt-PT não existir.
8. Posters com logótipos gráficos de plataformas e testes visuais por marca, respeitando as regras aplicáveis.
9. Observabilidade com métricas agregadas, orçamento de API e alertas de indisponibilidade.
10. A qualidade de reprodução não é conhecida por um addon de catálogos. Filtros 4K/HDR só fazem sentido com dados legais de disponibilidade/formato ou integração com um fornecedor autorizado; não se inferem a partir do poster.

## Documentação oficial consultada

- https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md
- https://stremio.github.io/stremio-addon-sdk/api/responses/manifest.html
- https://stremio.github.io/stremio-addon-sdk/api/requests/defineCatalogHandler.html
- https://developer.themoviedb.org/reference/watch-providers-movie-list
- https://developer.themoviedb.org/reference/watch-providers-tv-list
- https://developer.themoviedb.org/reference/discover-movie
- https://developer.themoviedb.org/reference/trending-all
- https://developer.themoviedb.org/reference/tv-series-watch-providers
- https://developer.themoviedb.org/docs/getting-started
- https://developer.themoviedb.org/docs/faq
- https://vercel.com/docs/caching/cache-control-headers
- https://vercel.com/docs/functions

Os dados de disponibilidade têm origem na parceria TMDB/JustWatch. Este produto não é certificado pelo TMDB nem afiliado ao Stremio ou às plataformas.
