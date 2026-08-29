/* Chargement et normalisation des données du quiz. */

const Data = (() => {
  const CREST_BASE = 'https://commons.wikimedia.org/wiki/Special:FilePath/';

  /** URL du blason, redimensionnée côté Wikimedia pour éviter de tirer des SVG lourds. */
  function crestUrl(club) {
    if (!club.crest) return null;
    return CREST_BASE + encodeURIComponent(club.crest) + '?width=160';
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
            club: { id: player.club, ...club, url: crestUrl(club) }
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

  return { load, normalize, crestUrl };
})();
