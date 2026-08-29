/* Chargement et normalisation des données du quiz. */

const Data = (() => {
  const CREST_BASE = 'https://commons.wikimedia.org/wiki/Special:FilePath/';
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
        const lineup = team.lineup.map((player) => {
          const club = clubs[player.club];
          if (!club) {
            problems.push(`${team.country} ${edition.year} — club inconnu : "${player.club}"`);
            return null;
          }
          return {
            name: player.name,
            first: player.first || '',
            needsCheck: !!(player.needsCheck || club.needsCheck),
            club: { id: player.club, ...club, url: crestUrl(club, resolved) }
          };
        });

        if (lineup.includes(null)) continue;

        questions.push({
          id: `${edition.year}-${normalize(team.country)}`,
          year: edition.year,
          host: edition.host,
          country: team.country,
          formation: team.formation,
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
