/* Rendu du terrain : place les onze pastilles à partir de la formation. */

const Pitch = (() => {
  /* Bandes verticales occupées par le gardien puis chaque ligne de la formation.
     Le terrain va de y=0 (attaque, en haut) à y=100 (but, en bas). */
  const GK_Y = 87;
  const FIRST_LINE_Y = 71;
  const LAST_LINE_Y = 14;

  const MARKINGS = `
    <svg class="markings" viewBox="0 0 100 120" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="rgba(255,255,255,.28)" stroke-width=".5">
        <rect x="4" y="3" width="92" height="114"/>
        <line x1="4" y1="60" x2="96" y2="60"/>
        <circle cx="50" cy="60" r="14"/>
        <rect x="24" y="97" width="52" height="20"/>
        <rect x="38" y="109" width="24" height="8"/>
        <path d="M 36 97 A 15 15 0 0 0 64 97"/>
        <rect x="24" y="3" width="52" height="20"/>
        <rect x="38" y="3" width="24" height="8"/>
        <path d="M 36 23 A 15 15 0 0 1 64 23"/>
      </g>
    </svg>`;

  /* Ancrage de chaque poste sur le terrain. x va de 0 (gauche) à 100 (droite),
     y de 0 (but adverse) à 100 (son propre but). C'est la vue classique d'une
     composition diffusée : l'équipe attaque vers le haut. */
  const SPOTS = {
    GK:  { x: 50, y: 88 },
    RB:  { x: 88, y: 73 }, CB: { x: 50, y: 73 }, LB: { x: 12, y: 73 },
    RWB: { x: 90, y: 63 }, LWB: { x: 10, y: 63 },
    DM:  { x: 50, y: 56 },
    RM:  { x: 86, y: 45 }, CM: { x: 50, y: 45 }, LM: { x: 14, y: 45 },
    AM:  { x: 50, y: 34 },
    RW:  { x: 84, y: 26 }, LW: { x: 16, y: 26 },
    SS:  { x: 50, y: 22 },
    CF:  { x: 50, y: 14 }, ST: { x: 50, y: 14 }
  };

  // Synonymes rencontrés dans les sources, ramenés aux codes ci-dessus.
  const SPOT_ALIASES = {
    RCB: 'CB', LCB: 'CB', SW: 'CB', RWB: 'RWB', LWB: 'LWB',
    CDM: 'DM', RDM: 'DM', LDM: 'DM',
    RCM: 'CM', LCM: 'CM',
    CAM: 'AM', RAM: 'AM', LAM: 'AM',
    RF: 'RW', LF: 'LW', CS: 'ST'
  };
  // `DF`, `MF` et `FW` sont absents à dessein : ce sont les codes grossiers des
  // listes d'effectif, pas des postes. Une équipe qui n'a que ceux-là bascule
  // sur la répartition par lignes.

  /** Écartement horizontal quand plusieurs joueurs partagent un poste. */
  function spread(count) {
    return count === 2 ? 32 : count === 3 ? 25 : 20;
  }

  /**
   * Place chaque joueur à son poste réel. Renvoie null si un seul poste est
   * inconnu : mieux vaut la répartition par lignes, cohérente, qu'un terrain
   * à moitié juste.
   */
  function coordsByPosition(lineup) {
    const codes = lineup.map((player) => {
      const raw = String(player.pos || '').toUpperCase().replace(/[^A-Z]/g, '');
      const code = SPOTS[raw] ? raw : SPOT_ALIASES[raw];
      return SPOTS[code] ? code : null;
    });
    if (codes.includes(null)) return null;

    /* Les ancrages ci-dessus donnent l'ordre des lignes, pas leur écartement.
       Un 4-2-3-1 en occupe six, un 4-4-2 quatre : on répartit donc uniformément
       les lignes réellement utilisées sur la hauteur disponible, sinon deux
       lignes voisines se chevauchent dès que les libellés s'en mêlent. */
    const levels = [...new Set(codes.map((c) => SPOTS[c].y))]
      .filter((y) => y !== SPOTS.GK.y)
      .sort((a, b) => a - b);

    const rowY = {};
    levels.forEach((level, index) => {
      rowY[level] = levels.length === 1
        ? (LAST_LINE_Y + FIRST_LINE_Y) / 2
        : LAST_LINE_Y + (index / (levels.length - 1)) * (FIRST_LINE_Y - LAST_LINE_Y);
    });
    rowY[SPOTS.GK.y] = GK_Y;
    coordsByPosition.rows = levels.length + 1;

    // Deux défenseurs centraux occupent le même ancrage : on les écarte
    // symétriquement, dans l'ordre où ils apparaissent.
    const groups = {};
    codes.forEach((code, index) => (groups[code] = groups[code] || []).push(index));

    const coords = [];
    for (const [code, members] of Object.entries(groups)) {
      const spot = SPOTS[code];
      const step = spread(members.length);
      members.forEach((index, rank) => {
        const offset = members.length > 1 ? (rank - (members.length - 1) / 2) * step : 0;
        coords[index] = {
          x: Math.max(8, Math.min(92, spot.x + offset)),
          y: rowY[spot.y]
        };
      });
    }
    return coords;
  }

  /** "4-2-3-1" → [[0], [1,2,3,4], [5,6], [7,8,9], [10]] (indices dans lineup). */
  function bandsFor(formation, size) {
    const counts = String(formation)
      .split('-')
      .map((n) => parseInt(n, 10))
      .filter((n) => n > 0);

    const total = counts.reduce((a, b) => a + b, 0);
    // Formation absente ou incohérente : on retombe sur un 4-4-2 pour ne jamais
    // perdre un joueur en route.
    const lines = total === size - 1 ? counts : [4, 4, 2];

    const bands = [[0]];
    let i = 1;
    for (const count of lines) {
      bands.push(Array.from({ length: count }, () => i++));
    }
    while (i < size) bands[bands.length - 1].push(i++);
    return bands;
  }

  function coordsFor(bands) {
    const lineCount = bands.length - 1;
    const step = lineCount > 1 ? (FIRST_LINE_Y - LAST_LINE_Y) / (lineCount - 1) : 0;

    const coords = [];
    bands.forEach((band, bandIndex) => {
      const y = bandIndex === 0 ? GK_Y : FIRST_LINE_Y - (bandIndex - 1) * step;
      band.forEach((playerIndex, k) => {
        const x = ((k + 1) / (band.length + 1)) * 100;
        coords[playerIndex] = { x, y };
      });
    });
    return coords;
  }

  function badgeFor(club) {
    const badge = document.createElement('div');
    badge.className = 'slot-badge';

    const mono = document.createElement('span');
    mono.className = 'slot-mono';
    mono.textContent = club.mono || club.name.slice(0, 3).toUpperCase();
    mono.style.background = club.colors?.[0] || '#243';
    mono.style.color = readableOn(club.colors?.[0] || '#243');

    if (!club.url) {
      badge.appendChild(mono);
      badge.dataset.fallback = 'true';
      return badge;
    }

    const img = document.createElement('img');
    img.src = club.url;
    img.alt = club.name;
    img.loading = 'eager';
    // Blason introuvable ou renommé sur Wikimedia : on bascule sur la pastille
    // aux couleurs du club plutôt que d'afficher un trou dans la composition.
    img.addEventListener('error', () => {
      badge.replaceChildren(mono);
      badge.dataset.fallback = 'true';
    });
    badge.appendChild(img);
    return badge;
  }

  function tag(className, text, title) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    span.title = title;
    return span;
  }

  /** Noir ou blanc selon la luminance du fond, pour que le monogramme reste lisible. */
  function readableOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return '#fff';
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14163a' : '#fff';
  }

  /**
   * @param {HTMLElement} host
   * @param {object} question
   * @param {'none'|'clubs'|'players'} labels — blasons nus, noms de clubs (aide
   *        payante), ou noms des joueurs une fois la réponse donnée.
   */
  function render(host, question, labels) {
    host.innerHTML = MARKINGS;

    // Les postes réels priment ; la répartition par lignes reste le recours
    // pour les équipes dont on n'a pas le détail.
    coordsByPosition.rows = 0;
    const positional = coordsByPosition(question.lineup);
    const bands = positional ? null : bandsFor(question.formation, question.lineup.length);
    const coords = positional || coordsFor(bands);

    // Plus il y a de lignes, moins chacune a de hauteur : les pastilles
    // rétrécissent en conséquence, sinon les libellés se chevauchent.
    const rows = positional ? coordsByPosition.rows : bands.length;
    host.style.setProperty('--slot-w', rows >= 6 ? '13%' : rows === 5 ? '16.5%' : '19%');

    question.lineup.forEach((player, index) => {
      const { x, y } = coords[index] || { x: 50, y: 50 };

      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.style.left = x + '%';
      slot.style.top = y + '%';
      slot.appendChild(badgeFor(player.club));

      if (labels === 'players') {
        slot.appendChild(tag('slot-label', player.name,
          `${player.first} ${player.name} — ${player.club.name}`));
        // Sur la révélation, le club sous le nom : c'est là que le joueur
        // apprend quelque chose, pas seulement qu'il gagne ou perd.
        slot.appendChild(tag('slot-sub', player.club.name, player.club.name));
      } else if (labels === 'clubs') {
        slot.appendChild(tag('slot-label is-club', player.club.name, player.club.name));
      }

      host.appendChild(slot);
    });

    /* Le terrain est une image pour l'arbre d'accessibilité : sans description
       de son contenu, la question est vide pour un lecteur d'écran. Les clubs
       *sont* l'énoncé — les nommer équivaut à voir les écussons. */
    host.setAttribute('role', 'img');
    const clubs = question.lineup.map((p) => p.club.name);
    host.setAttribute('aria-label', labels === 'players'
      ? `Composition de ${question.country} en ${question.year} : ` +
        question.lineup.map((p) => `${p.name}, ${p.club.name}`).join(' ; ')
      : `Onze clubs à identifier : ${clubs.join(', ')}`);
  }

  return { render, readableOn };
})();
