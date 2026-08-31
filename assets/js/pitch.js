/* Rendu du terrain : place les onze pastilles à partir de la formation. */

const Pitch = (() => {
  /* On ne montre pas le terrain entier. Une équipe au coup d'envoi tient dans
     sa moitié plus le premier quart de celle d'en face : dessiner les 105 m
     complets écrase les onze dans le bas de l'image et fait passer des
     défenseurs pour des milieux. On cadre donc sur 3/4 de terrain — but propre
     en bas, ligne médiane vers le haut, camp adverse à peine entamé.

     Bandes verticales occupées par le gardien puis chaque ligne de la
     formation, de y=0 (haut du cadre, camp adverse) à y=100 (ligne de but). */
  const GK_Y = 91;
  const FIRST_LINE_Y = 76;
  const LAST_LINE_Y = 12;

  /* Marquages à l'échelle : 68 m de large sur 78,75 m (les 3/4 de 105 m),
     rendus dans un repère de 100 × 116 unités. La ligne du haut n'est pas
     tracée — c'est une coupe, pas une limite du terrain. */
  const MARKINGS = `
    <svg class="markings" viewBox="0 0 100 116" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="rgba(255,255,255,.28)" stroke-width=".5">
        <path d="M 2 0 L 2 114 L 98 114 L 98 0"/>
        <line x1="2" y1="37" x2="98" y2="37"/>
        <circle cx="50" cy="37" r="13.5"/>
        <circle cx="50" cy="37" r="1" fill="rgba(255,255,255,.28)"/>
        <rect x="21.5" y="90" width="57" height="24"/>
        <rect x="37" y="106" width="26" height="8"/>
        <circle cx="50" cy="97.8" r="1" fill="rgba(255,255,255,.28)"/>
        <path d="M 39 90 A 13.5 13.5 0 0 0 61 90"/>
      </g>
    </svg>`;

  /* Ancrage de chaque poste sur le terrain. x va de 0 (gauche) à 100 (droite),
     y de 0 (but adverse) à 100 (son propre but). C'est la vue classique d'une
     composition diffusée : l'équipe attaque vers le haut. */
  const SPOTS = {
    GK:  { x: 50, y: 91 },
    RB:  { x: 88, y: 76 }, CB: { x: 50, y: 76 }, LB: { x: 12, y: 76 },
    RWB: { x: 90, y: 66 }, LWB: { x: 10, y: 66 },
    DM:  { x: 50, y: 58 },
    RM:  { x: 86, y: 46 }, CM: { x: 50, y: 46 }, LM: { x: 14, y: 46 },
    AM:  { x: 50, y: 34 },
    RW:  { x: 84, y: 24 }, LW: { x: 16, y: 24 },
    SS:  { x: 50, y: 20 },
    CF:  { x: 50, y: 12 }, ST: { x: 50, y: 12 }
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

  /* Proportions du cadre, nécessaires pour convertir une largeur en hauteur :
     la pastille est ronde, or les coordonnées sont en pourcentage de chaque axe. */
  const FRAME_RATIO = 68 / 79;

  /* Part du créneau occupée par le disque. Doit rester égale à la largeur
     donnée à `.slot-badge` dans la feuille de style : c'est elle qui fait le
     lien entre la taille calculée ici et celle réellement affichée. */
  const BADGE_FILL = 0.78;

  /* Bornes du disque, en % de la largeur du terrain. Le plancher garde un
     blason identifiable dans les compositions les plus denses ; le plafond
     l'empêche d'avaler les marquages dans les plus aérées. */
  const MIN_DISC = 7;
  const MAX_DISC = 16;

  /* Ce que deux disques voisins d'une même ligne se laissent : le diamètre ne
     dépasse pas 82 % de la distance entre leurs centres. */
  const DISC_GAP = 0.82;

  /* Mêmes marges pour le libellé, qui est bien plus large que son disque : il
     prend 92 % de l'écart avec son voisin, et un latéral 96 % de ce qui reste
     jusqu'à la touche. Le reste est le blanc qui les sépare. */
  const LABEL_GAP = 0.92;
  const LABEL_EDGE = 0.96;

  /* Hauteur réclamée par un libellé d'une seule ligne, en % de la hauteur du
     terrain. La révélation en empile deux — sauf sur petit écran, où le club
     n'est plus affiché : c'est la feuille de style qui tranche, via
     `--label-h`, puisque c'est elle qui décide de le masquer. */
  const ONE_LABEL_H = 4.5;

  /**
   * Hauteur à réserver sous les pastilles pour cet affichage, estimée avant
   * tout rendu.
   *
   * Zéro pendant la question : il n'y a alors aucun libellé, et leur réserver
   * la place revenait à rétrécir les blasons pour rien — c'est ce qui les
   * rendait minuscules sur téléphone, où le terrain est déjà petit.
   */
  function estimatedLabelHeight(host, labels) {
    if (labels === 'none') return 0;
    if (labels === 'clubs') return ONE_LABEL_H;
    const declared = parseFloat(getComputedStyle(host).getPropertyValue('--label-h'));
    return Number.isFinite(declared) ? declared : 2 * ONE_LABEL_H;
  }

  /**
   * Hauteur réellement occupée par les libellés, mesurée sur la page.
   *
   * L'estimation ci-dessus est une proportion, or les libellés se dessinent en
   * pixels : sur un terrain rendu court — un téléphone couché, une fenêtre
   * large et basse — ils en mangent une part bien plus grande que prévu, et
   * deux lignes voisines finissent par se toucher. On mesure donc dès que le
   * terrain a une taille, l'estimation ne servant plus que d'amorce.
   *
   * @returns {number|null} part de la hauteur du terrain, en %, ou null tant
   *          que rien n'est affiché — un écran masqué n'a aucune boîte.
   */
  function measuredLabelHeight(host) {
    const height = host.getBoundingClientRect().height;
    if (!height) return null;

    /* Le créneau, c'est la pastille puis ce qui la suit : leur différence de
       hauteur est exactement la place que les libellés réclament, marges
       comprises. Elle ne dépend pas de la taille du disque — les libellés se
       dimensionnent sur la fenêtre — donc mesurer ne relance pas le calcul. */
    let tallest = 0;
    for (const slot of host.querySelectorAll('.slot')) {
      const badge = slot.querySelector('.slot-badge');
      if (badge) tallest = Math.max(tallest, slot.offsetHeight - badge.offsetHeight);
    }
    return (tallest / height) * 100;
  }

  /**
   * Dimensions à donner aux créneaux pour cette composition.
   *
   * Deux contraintes distinctes, longtemps confondues : le disque est rond,
   * c'est donc la hauteur disponible entre deux lignes qui le borne ; le
   * libellé, lui, ne s'étale qu'horizontalement et peut déborder largement du
   * disque. Les lier revenait à tronquer « Griezmann » parce que la ligne
   * au-dessus était proche.
   *
   * Tout est ici en proportion du terrain : la taille en pixels dépend de
   * l'appareil, et c'est la feuille de style qui la borne (`--slot-cap`).
   *
   * @param {number} labelH hauteur réservée aux libellés, en % de la hauteur.
   * @returns {{badge: number, label: number}} largeur du créneau en % de la
   *          largeur du terrain, et largeur du libellé en % du créneau.
   */
  function slotMetrics(coords, labelH) {
    let gapX = 100;
    let gapY = 100;
    for (let i = 0; i < coords.length; i++) {
      for (let j = i + 1; j < coords.length; j++) {
        const dx = Math.abs(coords[i].x - coords[j].x);
        const dy = Math.abs(coords[i].y - coords[j].y);
        // Même ligne à quelques dixièmes près : c'est l'écart horizontal qui
        // contraint. Lignes différentes : c'est l'écart vertical.
        if (dy < 4) gapX = Math.min(gapX, dx);
        else gapY = Math.min(gapY, dy);
      }
    }

    const byWidth = gapX * DISC_GAP;
    const byHeight = Math.max(0, gapY - labelH) / FRAME_RATIO;
    const disc = Math.max(MIN_DISC, Math.min(MAX_DISC, byWidth, byHeight));
    const badge = disc / BADGE_FILL;

    /* Le libellé prend tout l'écart horizontal — moins une marge, pour que deux
       voisins ne se touchent pas — mais un latéral est collé à sa touche : sa
       place vers l'extérieur est ce qui reste jusqu'au bord du terrain. */
    const toEdge = Math.min(...coords.map((c) => Math.min(c.x, 100 - c.x)));
    const label = Math.min(gapX * LABEL_GAP, 2 * toEdge * LABEL_EDGE);
    return { badge, label };
  }

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

  /* Profondeur de chaque ligne selon leur nombre, du plus reculé au plus
     avancé. Étaler uniformément de la défense à l'attaque donne un 4-3-3 dont
     les milieux jouent au-delà du rond central : ces valeurs sont celles d'une
     composition telle qu'on la voit à la télévision. */
  const LINE_DEPTHS = {
    1: [46],
    2: [72, 28],
    3: [75, 51, 20],
    4: [77, 60, 40, 18],
    5: [78, 64, 48, 32, 16]
  };

  function coordsFor(bands) {
    const lines = bands.length - 1;
    const depths = LINE_DEPTHS[lines]
      // Au-delà de cinq lignes, la table n'a plus rien à dire : on répartit.
      || Array.from({ length: lines }, (_, i) =>
        FIRST_LINE_Y - (i / (lines - 1)) * (FIRST_LINE_Y - LAST_LINE_Y));

    const coords = [];
    bands.forEach((band, bandIndex) => {
      const y = bandIndex === 0 ? GK_Y : depths[bandIndex - 1];
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

  // Position de repli d'un joueur qu'aucun calcul n'a su placer : le centre du
  // terrain, où il se voit — plutôt qu'un coin, où il passerait pour un choix.
  const CENTRE = { x: 50, y: 50 };

  /** Un joueur : sa pastille, et selon l'affichage ce qui s'écrit dessous. */
  function slotFor(player, { x, y }, labels) {
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
    return slot;
  }

  /** Noir ou blanc selon la luminance du fond, pour que le monogramme reste lisible. */
  function readableOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return '#fff';
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14163a' : '#fff';
  }

  /* Disposition en cours sur chaque terrain, gardée pour pouvoir redimensionner
     les pastilles sans tout redessiner. */
  const layouts = new WeakMap();

  /** Applique à un terrain les tailles que sa disposition et sa place autorisent. */
  function fit(host) {
    const layout = layouts.get(host);
    if (!layout) return;

    const measured = measuredLabelHeight(host);
    const metrics = slotMetrics(layout.coords,
      measured === null ? layout.estimate : measured);
    host.style.setProperty('--slot-w', metrics.badge.toFixed(1) + '%');

    /* La largeur du libellé se mesure sur le terrain, pas sur le créneau : ce
       dernier peut avoir été rogné par `--slot-cap`, et un pourcentage de
       créneau ne dirait alors plus rien de la place réellement libre entre
       deux voisins. Tant que le terrain n'est pas affiché, faute de pixels,
       on retombe sur cette proportion approchée. */
    const width = host.getBoundingClientRect().width;
    host.style.setProperty('--label-w', width
      ? Math.round(metrics.label * width / 100) + 'px'
      : Math.round(metrics.label / metrics.badge * 100) + '%');
  }

  /* Le terrain est dessiné pendant que son écran est encore masqué : il n'a
     alors aucune dimension, donc rien à mesurer. L'observateur rattrape la
     mesure dès qu'il en prend une — à l'affichage, puis à chaque rotation ou
     redimensionnement de la fenêtre. */
  const watcher = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => entries.forEach((entry) => fit(entry.target)))
    : null;

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

    layouts.set(host, { coords, estimate: estimatedLabelHeight(host, labels) });

    question.lineup.forEach((player, index) => {
      host.appendChild(slotFor(player, coords[index] || CENTRE, labels));
    });

    // Les pastilles ne prennent leur taille qu'ici : elle se déduit de la
    // densité de la composition, mais aussi de la place que les libellés
    // occupent réellement — et ceux-ci viennent d'être posés.
    fit(host);
    if (watcher) watcher.observe(host);

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
