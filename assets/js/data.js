/* Chargement et normalisation des données du quiz. */

const Data = (() => {
  // Special:FilePath d'en.wikipedia résout les fichiers locaux *et* ceux de
  // Commons. Passer par commons.wikimedia.org renvoie 404 pour les écussons en
  // usage loyal, qui ne sont hébergés que localement — c'est-à-dire la plupart.
  const CREST_BASE = 'https://en.wikipedia.org/wiki/Special:FilePath/';
  const WIKI_API = 'https://en.wikipedia.org/w/api.php';
  const CACHE_KEY = 'soccerquiz.crests.v1';
  const BATCH = 50;          // plafond de titres par requête pour un appel anonyme
  const THUMB = 200;         // largeur des vignettes demandées, en pixels

  const LOCAL_CRESTS = 'assets/crests/';

  /**
   * URL du blason, par ordre de préférence :
   *   1. `file`  — copie locale déposée par tools/fetch-crests.py, sans réseau
   *   2. `crest` — nom de fichier Wikimedia épinglé à la main
   *   3. la vignette résolue depuis le titre d'article
   *
   * Deviner des noms de fichiers Wikimedia s'est révélé peu fiable — 44 sur 55
   * étaient faux — d'où la résolution par article, puis la copie locale.
   */
  function crestUrl(club, resolved) {
    if (club.file) return LOCAL_CRESTS + encodeURIComponent(club.file);
    if (club.crest) return CREST_BASE + encodeURIComponent(club.crest) + `?width=${THUMB}`;
    return (resolved && club.wiki && resolved[club.wiki]) || null;
  }

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    } catch {
      return {};   // navigation privée, stockage bloqué : on refera l'appel
    }
  }

  function writeCache(cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch { /* quota ou stockage refusé : le cache est un confort, pas un besoin */ }
  }

  /* Un article de club contient des dizaines de fichiers : maillots, drapeaux,
     logos de compétition, icônes d'interface. Ces motifs écartent le bruit
     avant de chercher l'écusson — les maillots sont les pires pièges, leur nom
     contenant celui du club. */
  const FILE_NOISE = new RegExp([
    'kit[ _](body|shorts|socks|left|right|arm)', '^kit[ _]', '_kit',
    'flag[ _]of', '^flag', 'location[ _]map', '^map[ _]', 'stadium', 'panorama',
    'commons-logo', 'wikimedia', 'wikipedia', 'wiki[ _]letter',
    'premier[ _]league', 'uefa', 'la[ _]liga', 'bundesliga', 'serie[ _]a',
    'ligue[ _]1', 'eredivisie', 'pictogram', 'soccer[ _]ball', 'football[ _]ball',
    'padlock', 'question', 'folder', 'edit-', 'ambox', 'symbol', 'red[ _]pog',
    'star[ _]full', 'increase', 'decrease', '\\.ogg$', '\\.oga$', '\\.webm$'
  ].join('|'), 'i');

  const FILE_GOOD = /(crest|logo|badge|escudo|shield|emblem|wappen)/i;

  // Trop courants dans les noms de clubs pour distinguer quoi que ce soit.
  const STOPWORDS = new Set(['club', 'football', 'fussball', 'deportivo', 'sport',
    'sporting', 'sportif', 'association', 'athletic', 'atletico', 'real', 'the',
    'saint', 'city', 'united', 'town', 'olympique', 'olympic']);

  /** Jetons distinctifs du nom d'un club, pour reconnaître son fichier. */
  function clubTokens(club) {
    return [...new Set(
      `${club.wiki || ''} ${club.name || ''}`
        .split(/[\s.,()'’\-]+/)
        .map((w) => normalize(w))
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    )];
  }

  function scoreFile(filename, tokens) {
    const bare = filename.replace(/^File:/i, '');
    if (FILE_NOISE.test(bare)) return -1;

    const flat = normalize(bare);
    let score = 0;
    for (const token of tokens) if (flat.includes(token)) score += 3;
    if (!score) return -1;                 // rien qui rattache le fichier au club
    if (FILE_GOOD.test(bare)) score += 4;
    if (/\.svg$/i.test(bare)) score += 1;
    return score;
  }

  async function query(params) {
    const res = await fetch(`${WIKI_API}?${new URLSearchParams(
      { action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })}`);
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  /**
   * Repli groupé : liste les fichiers de chaque article, retient le meilleur
   * candidat par club, puis demande les vignettes en une seule fois.
   */
  async function resolveFromPageFiles(titles, clubs) {
    const byTitle = {};
    for (const club of Object.values(clubs)) {
      if (club.wiki) byTitle[club.wiki] = club;
    }

    const chosen = {};       // titre d'article -> nom de fichier retenu
    const FILE_BATCH = 20;   // articles par requête, pour borner la réponse

    for (let i = 0; i < titles.length; i += FILE_BATCH) {
      const chunk = titles.slice(i, i + FILE_BATCH);
      const best = {};
      let cont = {};

      try {
        for (let round = 0; round < 5; round++) {
          const json = await query({
            prop: 'images', imlimit: '500', redirects: '1',
            titles: chunk.join('|'), ...cont
          });

          const alias = {};
          for (const r of json.query?.redirects || []) alias[r.to] = r.from;

          for (const page of json.query?.pages || []) {
            const key = alias[page.title] || page.title;
            const club = byTitle[key];
            if (!club) continue;
            const tokens = clubTokens(club);
            for (const image of page.images || []) {
              const score = scoreFile(image.title, tokens);
              if (score > (best[key]?.score ?? 0)) best[key] = { score, file: image.title };
            }
          }

          if (!json.continue) break;
          cont = json.continue;
        }
      } catch {
        continue;   // ce lot reste en pastille, les autres passent quand même
      }

      for (const [title, pick] of Object.entries(best)) chosen[title] = pick.file;
    }

    // Une seule requête pour convertir les fichiers retenus en vignettes.
    const files = [...new Set(Object.values(chosen))];
    const thumbs = {};
    for (let i = 0; i < files.length; i += BATCH) {
      try {
        const json = await query({
          prop: 'imageinfo', iiprop: 'url', iiurlwidth: String(THUMB),
          titles: files.slice(i, i + BATCH).join('|')
        });
        for (const page of json.query?.pages || []) {
          const info = page.imageinfo?.[0];
          if (info) thumbs[page.title] = info.thumburl || info.url;
        }
      } catch { /* les vignettes manquantes retombent en pastille */ }
    }

    const resolved = {};
    for (const [title, file] of Object.entries(chosen)) {
      if (thumbs[file]) resolved[title] = thumbs[file];
    }
    return resolved;
  }

  /**
   * Demande à Wikipédia l'image principale de chaque article de club. Seules
   * les résolutions réussies sont mises en cache : un échec réseau ne fige
   * donc pas un club en pastille pour toujours.
   */
  async function resolveCrests(clubs) {
    const cache = readCache();
    const titles = [...new Set(
      Object.values(clubs)
        .filter((club) => club.wiki && !club.file && !club.crest && !cache[club.wiki])
        .map((club) => club.wiki)
    )];

    // Tous les blasons sont déjà servis localement : aucun appel réseau.
    if (!titles.length) return cache;

    for (let i = 0; i < titles.length; i += BATCH) {
      const chunk = titles.slice(i, i + BATCH);
      const params = new URLSearchParams({
        action: 'query', format: 'json', formatversion: '2', origin: '*',
        prop: 'pageimages', piprop: 'thumbnail', pithumbsize: String(THUMB),
        // Sans `pilicense=any`, l'API retient par défaut les seules images
        // libres et écarte silencieusement les écussons en usage loyal —
        // c'est-à-dire la plupart des clubs anglais, espagnols et portugais.
        pilicense: 'any',
        redirects: '1', titles: chunk.join('|')
      });

      try {
        const res = await fetch(`${WIKI_API}?${params}`);
        if (!res.ok) continue;
        const json = await res.json();

        // `redirects=1` renvoie le titre d'arrivée : on recolle l'alias pour
        // retrouver le titre tel qu'il est écrit dans clubs.json.
        const alias = {};
        for (const r of json.query?.redirects || []) alias[r.to] = r.from;

        for (const page of json.query?.pages || []) {
          const src = page.thumbnail?.source;
          if (!src) continue;
          cache[page.title] = src;
          if (alias[page.title]) cache[alias[page.title]] = src;
        }
      } catch {
        // Hors ligne ou API injoignable : les pastilles de repli prennent le relais.
      }
    }

    // pageimages n'indexe pas de façon fiable les écussons en usage loyal :
    // pour ce qu'il laisse vide, on liste les fichiers de l'article et on
    // choisit le meilleur candidat. Deux requêtes groupées, pas une par club.
    const stillMissing = titles.filter((t) => !cache[t]);
    if (stillMissing.length) {
      Object.assign(cache, await resolveFromPageFiles(stillMissing, clubs));
    }

    writeCache(cache);
    return cache;
  }

  /** Retire accents et casse pour comparer les saisies. */
  function normalize(str) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['’\-\s.]/g, '');
  }

  const DEFAULT_FORMATION = '4-3-3';
  // Un 4-3-3 : le gardien, puis quatre défenseurs, trois milieux, trois attaquants.
  const SHAPE = [['GK', 1], ['DF', 4], ['MF', 3], ['FW', 3]];

  /**
   * Ramène un effectif de Coupe du monde à un onze plausible. Les données
   * publiques donnent les 26 sélectionnés et leur poste, pas la composition
   * alignée : on tire donc un onze cohérent, différent à chaque partie.
   */
  function pickEleven(squad) {
    if (!squad.length) return [];
    const pools = {};
    for (const player of squad) {
      const pos = String(player.pos || '').toUpperCase();
      (pools[pos] = pools[pos] || []).push(player);
    }
    for (const pool of Object.values(pools)) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }

    const eleven = [];
    for (const [pos, count] of SHAPE) {
      eleven.push(...(pools[pos] || []).splice(0, count));
    }
    // Poste manquant ou effectif déséquilibré : on complète avec le reste,
    // plutôt que de perdre la question.
    if (eleven.length < 11) {
      const rest = Object.values(pools).flat().filter((p) => !eleven.includes(p));
      eleven.push(...rest.slice(0, 11 - eleven.length));
    }
    return eleven.slice(0, 11);
  }

  /**
   * Couleur déterministe tirée du nom, pour les clubs dont on n'a pas les
   * vraies couleurs — un référentiel de plusieurs centaines de clubs ne peut
   * pas être colorié à la main, et la pastille de repli doit rester lisible.
   */
  function derivedColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 55% 38%)`;
  }

  async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} : ${res.status} ${res.statusText}`);
    return res.json();
  }

  /**
   * Aplatit les éditions en une liste de questions, en résolvant chaque
   * identifiant de club. Un identifiant inconnu fait échouer le chargement
   * plutôt que d'afficher un blason vide en pleine partie.
   */
  async function load() {
    const [clubsFile, editionsFile, countriesFile] = await Promise.all([
      loadJSON('data/clubs.json'),
      loadJSON('data/editions.json'),
      loadJSON('data/countries.json')
    ]);

    const clubs = clubsFile.clubs;
    // La résolution des blasons ne doit jamais retarder le jeu : elle est
    // tentée ici, et son échec se traduit simplement par des pastilles.
    const resolved = await resolveCrests(clubs);

    const questions = [];
    const problems = [];

    for (const edition of editionsFile.editions) {
      for (const team of edition.teams) {
        // Un effectif de 26 (données de Coupe du monde) est ramené à un onze
        // plausible ; une composition déjà figée est prise telle quelle.
        const selection = team.lineup || pickEleven(team.squad || []);
        if (selection.length !== 11) {
          problems.push(`${team.country} ${edition.year} — ${selection.length} joueurs retenus au lieu de 11`);
          continue;
        }

        const lineup = selection.map((player) => {
          const club = clubs[player.club];
          if (!club) {
            problems.push(`${team.country} ${edition.year} — club inconnu : "${player.club}"`);
            return null;
          }
          return {
            name: player.name,
            first: player.first || '',
            needsCheck: !!(player.needsCheck || club.needsCheck),
            club: {
              id: player.club,
              ...club,
              colors: club.colors || [derivedColor(club.name), '#ffffff'],
              url: crestUrl(club, resolved)
            }
          };
        });

        if (lineup.includes(null)) continue;

        questions.push({
          id: `${edition.year}-${normalize(team.country)}`,
          year: edition.year,
          host: edition.host,
          country: team.country,
          formation: team.formation || DEFAULT_FORMATION,
          note: team.note || '',
          source: team.source || '',
          confidence: team.confidence || 'unknown',
          lineup
        });
      }
    }

    if (problems.length) throw new Error('Données incohérentes :\n' + problems.join('\n'));

    const years = [...new Set(questions.map((q) => q.year))].sort((a, b) => b - a);

    return {
      questions,
      years,
      countries: countriesFile.countries,
      worldCupYears: countriesFile.worldCupYears
    };
  }

  return { load, normalize, crestUrl, resolveCrests };
})();
