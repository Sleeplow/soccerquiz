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

    const bands = bandsFor(question.formation, question.lineup.length);
    const coords = coordsFor(bands);

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
  }

  return { render, readableOn };
})();
