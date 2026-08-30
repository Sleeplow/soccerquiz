/* Tableau des meilleurs scores, conservé dans le navigateur du joueur.
 *
 * Le site est statique : il n'y a pas de serveur où déposer un classement
 * commun. Chaque navigateur garde donc le sien, et rien ne circule.
 */

const Scores = (() => {
  const KEY = 'soccerquiz.scores.v1';
  const KEEP = 10;                 // longueur du classement, par mode
  const NAME_MAX = 16;
  const MODES = ['normal', 'expert'];

  function empty() {
    return Object.fromEntries(MODES.map((mode) => [mode, []]));
  }

  /** Ne conserve que des entrées bien formées : le stockage est modifiable. */
  function sanitize(raw) {
    const board = empty();
    for (const mode of MODES) {
      const list = Array.isArray(raw?.[mode]) ? raw[mode] : [];
      board[mode] = list
        .filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.score))
        .map((e) => ({
          name: String(e.name).slice(0, NAME_MAX),
          score: Math.max(0, Math.round(e.score)),
          max: Number.isFinite(e.max) ? Math.round(e.max) : 0,
          questions: Number.isFinite(e.questions) ? Math.round(e.questions) : 0,
          correct: Number.isFinite(e.correct) ? Math.round(e.correct) : 0,
          years: Array.isArray(e.years) ? e.years.filter(Number.isFinite) : [],
          date: typeof e.date === 'string' ? e.date : ''
        }))
        .sort(byScore)
        .slice(0, KEEP);
    }
    return board;
  }

  // À score égal, le plus économe en questions passe devant.
  function byScore(a, b) {
    return b.score - a.score || a.questions - b.questions;
  }

  function load() {
    try {
      return sanitize(JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch {
      return empty();   // stockage refusé ou contenu illisible
    }
  }

  function save(board) {
    try {
      localStorage.setItem(KEY, JSON.stringify(board));
      return true;
    } catch {
      return false;     // navigation privée, quota : le jeu continue sans
    }
  }

  function list(mode) {
    return load()[mode] || [];
  }

  /** Un score nul n'entre jamais au classement, même s'il reste de la place. */
  function qualifies(mode, score) {
    if (!MODES.includes(mode) || score <= 0) return false;
    const entries = list(mode);
    return entries.length < KEEP || score > entries[entries.length - 1].score;
  }

  /**
   * Insère une entrée et renvoie son rang (1 = premier), ou 0 si elle n'a pas
   * sa place. L'entrée conservée est renvoyée pour pouvoir la mettre en avant.
   */
  function add(mode, entry) {
    if (!qualifies(mode, entry.score)) return { rank: 0, saved: null, stored: false };

    const board = load();
    const row = {
      name: (entry.name || '').trim().slice(0, NAME_MAX) || 'Anonyme',
      score: Math.max(0, Math.round(entry.score)),
      max: Math.round(entry.max || 0),
      questions: Math.round(entry.questions || 0),
      correct: Math.round(entry.correct || 0),
      years: [...(entry.years || [])].sort((a, b) => b - a),
      date: new Date().toISOString().slice(0, 10)
    };

    board[mode] = [...board[mode], row].sort(byScore).slice(0, KEEP);
    const stored = save(board);
    return { rank: board[mode].indexOf(row) + 1, saved: row, stored };
  }

  function clear(mode) {
    const board = load();
    if (mode) board[mode] = [];
    else Object.assign(board, empty());
    return save(board);
  }

  return { list, qualifies, add, clear, KEEP, NAME_MAX, MODES };
})();
