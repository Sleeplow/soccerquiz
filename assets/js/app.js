/* Moteur de jeu : réglages, déroulé des questions, score. */

(() => {
  const POINTS = {
    country: 100,      // bonne sélection
    speedMax: 100,     // prime de rapidité, proportionnelle au temps restant
    yearExact: 60,     // bonne édition (mode expert)
    yearNear: 30,      // édition voisine (mode expert)
    hint: -30          // coût de l'aide « noms des clubs »
  };

  const el = (id) => document.getElementById(id);

  const dom = {
    setup: el('setup'),
    editionFilter: el('edition-filter'),
    expertWarning: el('expert-warning'),
    poolInfo: el('pool-info'),
    questionCount: el('question-count'),
    timerSeconds: el('timer-seconds'),

    hudIndex: el('hud-index'),
    hudScore: el('hud-score'),
    timer: el('timer'),
    timerFill: document.querySelector('.timer-fill'),
    pitch: el('pitch'),
    pitchCaption: el('pitch-caption'),

    answerForm: el('answer-form'),
    countryInput: el('country-input'),
    countryList: el('country-list'),
    yearInput: el('year-input'),
    skipBtn: el('skip-btn'),

    verdict: el('verdict'),
    pitchReveal: el('pitch-reveal'),
    revealCaption: el('reveal-caption'),
    revealSource: el('reveal-source'),
    nextBtn: el('next-btn'),

    finalScore: el('final-score'),
    recap: el('recap'),
    replayBtn: el('replay-btn'),
    homeBtn: el('home-btn'),

    scoreEntry: el('score-entry'),
    scoreEntryLead: el('score-entry-lead'),
    playerName: el('player-name'),
    endBoard: el('end-board'),
    boardBtn: el('board-btn'),
    boardTabs: el('board-tabs'),
    boardBody: el('board-body'),
    boardBack: el('board-back'),
    boardClear: el('board-clear')
  };

  let data = null;
  const state = {
    mode: 'normal',
    duration: 30,
    queue: [],
    index: 0,
    score: 0,
    results: [],
    years: [],
    run: null,
    hintUsed: false,
    deadline: 0,
    tick: null
  };

  /* ── Écrans ─────────────────────────────── */

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.id === id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Réglages ───────────────────────────── */

  function buildEditionChips() {
    dom.editionFilter.innerHTML = '';
    for (const year of data.years) {
      const count = data.questions.filter((q) => q.year === year).length;
      const label = document.createElement('label');
      label.className = 'chip';
      label.innerHTML =
        `<input type="checkbox" name="year" value="${year}" checked>` +
        `<span>${year} <small>(${count})</small></span>`;
      dom.editionFilter.appendChild(label);
    }
    dom.editionFilter.addEventListener('change', refreshSetup);
    dom.setup.addEventListener('change', refreshSetup);
  }

  function selectedYears() {
    return [...dom.editionFilter.querySelectorAll('input:checked')].map((i) => Number(i.value));
  }

  function pool() {
    const years = selectedYears();
    return data.questions.filter((q) => years.includes(q.year));
  }

  function refreshSetup() {
    const size = pool().length;
    const editions = new Set(pool().map((q) => q.year)).size;
    const expert = dom.setup.querySelector('input[name="mode"]:checked').value === 'expert';

    dom.poolInfo.textContent = size
      ? `${size} équipe${size > 1 ? 's' : ''} disponible${size > 1 ? 's' : ''} sur ${editions} édition${editions > 1 ? 's' : ''}.`
      : 'Aucune équipe sélectionnée.';

    // Deviner l'année n'a aucun sens quand une seule édition est en jeu :
    // la réponse est donnée par le filtre lui-même.
    const degenerate = expert && editions < 2;
    dom.expertWarning.hidden = !degenerate;
    if (degenerate) {
      dom.expertWarning.textContent =
        "Une seule édition sélectionnée : en mode expert, l'année serait offerte. " +
        'Coche au moins deux éditions pour que le mode ait du sens.';
    }

    dom.setup.querySelector('button[type="submit"]').disabled = size === 0;
  }

  /* ── Partie ─────────────────────────────── */

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startGame(event) {
    event.preventDefault();
    const wanted = Number(dom.questionCount.value);
    const all = shuffle(pool());

    state.mode = dom.setup.querySelector('input[name="mode"]:checked').value;
    state.duration = Number(dom.timerSeconds.value);
    state.queue = wanted > 0 ? all.slice(0, wanted) : all;
    state.years = selectedYears();
    state.index = 0;
    state.score = 0;
    state.results = [];

    dom.yearInput.hidden = state.mode !== 'expert';
    askQuestion();
  }

  function current() {
    return state.queue[state.index];
  }

  function askQuestion() {
    const q = current();
    state.hintUsed = false;
    resetHint();

    dom.hudIndex.textContent = String(state.index + 1);
    dom.hudScore.textContent = `${state.score} pt${Math.abs(state.score) > 1 ? 's' : ''}`;

    Pitch.render(dom.pitch, q, 'none');
    dom.pitchCaption.textContent =
      state.mode === 'expert'
        ? 'Quelle sélection, et à quelle Coupe du monde ?'
        : `Coupe du monde ${q.year} — quelle sélection ?`;

    dom.countryInput.value = '';
    closeList();
    dom.yearInput.value = '';
    show('screen-play');
    dom.countryInput.focus();
    startTimer();
  }

  /* ── Chrono ─────────────────────────────── */

  function startTimer() {
    stopTimer();
    if (!state.duration) {
      dom.timer.hidden = true;
      return;
    }
    dom.timer.hidden = false;
    dom.timer.classList.remove('is-urgent');
    state.deadline = Date.now() + state.duration * 1000;
    dom.timerFill.style.transform = 'scaleX(1)';

    state.tick = setInterval(() => {
      const left = Math.max(0, state.deadline - Date.now());
      const ratio = left / (state.duration * 1000);
      dom.timerFill.style.transform = `scaleX(${ratio})`;
      dom.timer.classList.toggle('is-urgent', ratio < 0.25);
      if (left <= 0) submitAnswer(null);
    }, 100);
  }

  function stopTimer() {
    if (state.tick) clearInterval(state.tick);
    state.tick = null;
  }

  function remainingRatio() {
    if (!state.duration) return 0;
    return Math.max(0, Math.min(1, (state.deadline - Date.now()) / (state.duration * 1000)));
  }

  /* ── Évaluation ─────────────────────────── */

  function nearestEditions(year) {
    const years = data.worldCupYears;
    const i = years.indexOf(year);
    return [years[i - 1], years[i + 1]].filter(Boolean);
  }

  /** @param {{country: string, year: number|null}|null} answer — null = abandon ou temps écoulé. */
  function submitAnswer(answer) {
    stopTimer();
    const q = current();
    const speedBonus = Math.round(POINTS.speedMax * remainingRatio());

    const countryOk = !!answer && Data.normalize(answer.country) === Data.normalize(q.country);
    let yearVerdict = 'n/a';
    if (state.mode === 'expert' && answer) {
      if (answer.year === q.year) yearVerdict = 'exact';
      else if (nearestEditions(q.year).includes(answer.year)) yearVerdict = 'near';
      else yearVerdict = 'miss';
    }

    let points = 0;
    if (countryOk) {
      points += POINTS.country + speedBonus;
      if (yearVerdict === 'exact') points += POINTS.yearExact;
      if (yearVerdict === 'near') points += POINTS.yearNear;
    }
    if (state.hintUsed) points += POINTS.hint;
    points = Math.max(0, points);

    state.score += points;
    state.results.push({ question: q, answer, countryOk, yearVerdict, points });
    reveal({ q, answer, countryOk, yearVerdict, points, speedBonus });
  }

  function reveal({ q, answer, countryOk, yearVerdict, points, speedBonus }) {
    const box = dom.verdict;
    box.classList.toggle('is-good', countryOk);
    box.classList.toggle('is-bad', !countryOk);

    const heading = countryOk ? `Bien vu — ${q.country}` : `Raté — c'était ${q.country}`;
    const bits = [];

    if (!answer) {
      bits.push(state.duration ? 'Temps écoulé.' : 'Question passée.');
    } else if (!countryOk) {
      bits.push(`Ta réponse : ${answer.country || '—'}.`);
    }

    if (countryOk) {
      bits.push(`${POINTS.country} pts pour la sélection`);
      if (speedBonus) bits.push(`+${speedBonus} de rapidité`);
      if (yearVerdict === 'exact') bits.push(`+${POINTS.yearExact} pour l'année exacte`);
      if (yearVerdict === 'near') bits.push(`+${POINTS.yearNear} : édition voisine (c'était ${q.year})`);
      if (yearVerdict === 'miss') bits.push(`année ratée (c'était ${q.year})`);
    }
    if (state.hintUsed) bits.push(`${POINTS.hint} pour l'aide`);

    box.innerHTML = `<h2>${heading}</h2><p>${bits.join(' · ')} → <b>${points} pt${points > 1 ? 's' : ''}</b></p>`;

    Pitch.render(dom.pitchReveal, q, 'players');
    dom.revealCaption.textContent =
      `${q.country} — Coupe du monde ${q.year} (${q.host})` +
      (q.declaredFormation ? ` · ${q.declaredFormation}` : '') +
      (q.note ? ` · ${q.note}` : '');

    const flags = q.lineup.filter((p) => p.needsCheck).map((p) => p.name);
    dom.revealSource.textContent =
      `Source : ${q.source || 'non renseignée'} · fiabilité : ${q.confidence}` +
      (flags.length ? ` · à vérifier : ${flags.join(', ')}` : '');

    dom.nextBtn.textContent =
      state.index + 1 < state.queue.length ? 'Question suivante' : 'Voir le résultat';
    show('screen-reveal');
    dom.nextBtn.focus();
  }

  function next() {
    state.index += 1;
    if (state.index < state.queue.length) askQuestion();
    else endGame();
  }

  function endGame() {
    // Sans chrono, la prime de rapidité est hors d'atteinte : l'inclure dans
    // le maximum afficherait un plafond que personne ne peut toucher.
    const perQuestion = POINTS.country
      + (state.duration ? POINTS.speedMax : 0)
      + (state.mode === 'expert' ? POINTS.yearExact : 0);
    const max = state.queue.length * perQuestion;
    dom.finalScore.textContent = `${state.score} pts sur ${max} possibles`;

    state.run = {
      score: state.score,
      max,
      questions: state.queue.length,
      correct: state.results.filter((r) => r.countryOk).length,
      years: state.years
    };

    // Le nom n'est demandé que si le score entre effectivement au classement.
    const eligible = Scores.qualifies(state.mode, state.score);
    dom.scoreEntry.hidden = !eligible;
    if (eligible) {
      const rank = Scores.list(state.mode).filter((e) => e.score >= state.score).length + 1;
      dom.scoreEntryLead.textContent =
        `${ordinal(rank)} place du classement ${state.mode === 'expert' ? 'expert' : 'normal'} — ` +
        'entre ton nom pour le garder.';
      dom.playerName.value = lastName();
    }
    renderBoard(dom.endBoard, state.mode, 0);

    dom.recap.innerHTML = '';
    for (const r of state.results) {
      const li = document.createElement('li');
      const mark = r.countryOk ? '<span class="ok">✓</span>' : '<span class="ko">✗</span>';
      const given = r.answer ? r.answer.country : '—';
      li.innerHTML =
        `${mark} <b>${r.question.country} ${r.question.year}</b> — ta réponse : ${given} · ${r.points} pts`;
      dom.recap.appendChild(li);
    }
    show('screen-end');
  }

  /* ── Liste des sélections ───────────────── */

  let listItems = [];
  let listCursor = -1;

  /**
   * Les sélections proposées pour la question en cours.
   *
   * En mode normal l'année est connue : on ne propose que les participants de
   * cette Coupe du monde. En expert elle est cherchée, donc on couvre les
   * éditions retenues au départ — et dès que le joueur choisit une année, la
   * liste se réduit à ses participants.
   *
   * Ce sont les participants réels de l'édition, pas les équipes dont on a une
   * question : les seconds révéleraient la réponse.
   */
  function answerChoices() {
    const forYear = (year) => data.participants[year];

    if (state.mode !== 'expert') {
      return forYear(current().year) || data.countries;
    }

    const picked = Number(dom.yearInput.value);
    if (picked) return forYear(picked) || data.countries;

    const union = new Set();
    let complete = true;
    for (const year of state.years) {
      const list = forYear(year);
      if (list) list.forEach((c) => union.add(c));
      else complete = false;   // édition sans participants connus
    }
    // Une édition non couverte ferait disparaître ses équipes de la liste :
    // on retombe alors sur le référentiel complet.
    return complete && union.size ? [...union].sort((a, b) => a.localeCompare(b, 'fr'))
                                  : data.countries;
  }

  function openList(matches) {
    dom.countryList.innerHTML = '';
    listItems = matches;
    listCursor = -1;

    if (!listItems.length) return closeList();

    listItems.forEach((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      li.setAttribute('role', 'option');
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(name);
      });
      dom.countryList.appendChild(li);
    });
    dom.countryList.hidden = false;
    dom.countryInput.setAttribute('aria-expanded', 'true');
  }

  function closeList() {
    dom.countryList.hidden = true;
    dom.countryInput.setAttribute('aria-expanded', 'false');
    listItems = [];
    listCursor = -1;
  }

  function pick(name) {
    dom.countryInput.value = name;
    closeList();
    dom.countryInput.focus();
  }

  function highlight(delta) {
    if (!listItems.length) return;
    listCursor = (listCursor + delta + listItems.length) % listItems.length;
    [...dom.countryList.children].forEach((li, i) =>
      li.setAttribute('aria-selected', String(i === listCursor)));
  }

  function refreshList() {
    const choices = answerChoices();
    const q = Data.normalize(dom.countryInput.value);
    if (!q) return openList(choices);

    const starts = choices.filter((c) => Data.normalize(c).startsWith(q));
    const contains = choices.filter(
      (c) => !starts.includes(c) && Data.normalize(c).includes(q));
    openList([...starts, ...contains]);
  }

  dom.countryInput.addEventListener('input', refreshList);
  // La liste s'ouvre entière au clic : c'est un menu déroulant, la saisie ne
  // sert qu'à le réduire quand il est long.
  dom.countryInput.addEventListener('focus', refreshList);
  dom.countryInput.addEventListener('click', refreshList);

  // En expert, choisir l'année restreint les sélections proposées.
  dom.yearInput.addEventListener('change', () => {
    const choices = answerChoices();
    if (dom.countryInput.value &&
        !choices.some((c) => Data.normalize(c) === Data.normalize(dom.countryInput.value))) {
      dom.countryInput.value = '';
    }
    if (!dom.countryList.hidden) refreshList();
  });

  dom.countryInput.addEventListener('keydown', (e) => {
    if (dom.countryList.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(-1); }
    else if (e.key === 'Escape') { closeList(); }
    else if (e.key === 'Enter' && listCursor >= 0) { e.preventDefault(); pick(listItems[listCursor]); }
  });

  dom.countryInput.addEventListener('blur', () => setTimeout(closeList, 120));

  /* ── Aide payante ───────────────────────── */

  const HINT_LABEL = `Afficher les noms des clubs (${POINTS.hint} pts)`;

  const hintBtn = document.createElement('button');
  hintBtn.type = 'button';
  hintBtn.className = 'btn btn-ghost';
  hintBtn.textContent = HINT_LABEL;
  dom.skipBtn.parentNode.insertBefore(hintBtn, dom.skipBtn);

  hintBtn.addEventListener('click', () => {
    if (state.hintUsed) return;
    state.hintUsed = true;
    Pitch.render(dom.pitch, current(), 'clubs');
    hintBtn.disabled = true;
    hintBtn.textContent = 'Noms affichés';
  });

  function resetHint() {
    hintBtn.disabled = false;
    hintBtn.textContent = HINT_LABEL;
  }

  /* ── Classement ─────────────────────────── */

  const LAST_NAME_KEY = 'soccerquiz.lastName';

  function lastName() {
    try { return localStorage.getItem(LAST_NAME_KEY) || ''; } catch { return ''; }
  }

  function rememberName(name) {
    try { localStorage.setItem(LAST_NAME_KEY, name); } catch { /* stockage refusé */ }
  }

  /** « 1re », « 2e », « 3e »… */
  function ordinal(rank) {
    return rank === 1 ? '1re' : `${rank}e`;
  }

  /**
   * @param {HTMLElement} host
   * @param {'normal'|'expert'} mode
   * @param {number} highlightRank — rang à mettre en avant, 0 pour aucun.
   *        On compare le rang et non l'objet : la liste est relue depuis le
   *        stockage, ses entrées n'ont donc plus la même identité.
   */
  function renderBoard(host, mode, highlightRank) {
    const entries = Scores.list(mode);
    host.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'board-title';
    title.textContent = mode === 'expert' ? 'Classement expert' : 'Classement normal';
    host.appendChild(title);

    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Aucun score enregistré pour ce mode.';
      host.appendChild(empty);
      return;
    }

    const table = document.createElement('ol');
    table.className = 'board';
    entries.forEach((entry, index) => {
      const li = document.createElement('li');
      if (highlightRank && index + 1 === highlightRank) li.className = 'is-new';

      const name = document.createElement('span');
      name.className = 'board-name';
      name.textContent = entry.name;          // jamais interprété comme du HTML

      const score = document.createElement('span');
      score.className = 'board-score';
      score.textContent = `${entry.score} pts`;

      const detail = document.createElement('span');
      detail.className = 'board-detail';
      const editions = entry.years?.length ? entry.years.join(', ') : '—';
      detail.textContent =
        `${entry.correct}/${entry.questions} trouvées · ${editions}` +
        (entry.date ? ` · ${entry.date}` : '');

      li.append(name, score, detail);
      table.appendChild(li);
    });
    host.appendChild(table);
  }

  let boardMode = 'normal';

  function showBoardScreen() {
    dom.boardTabs.innerHTML = '';
    for (const mode of Scores.MODES) {
      const label = document.createElement('label');
      label.className = 'chip';
      label.innerHTML =
        `<input type="radio" name="board-mode" value="${mode}"${mode === boardMode ? ' checked' : ''}>` +
        `<span>${mode === 'expert' ? 'Expert' : 'Normal'} <small>(${Scores.list(mode).length})</small></span>`;
      dom.boardTabs.appendChild(label);
    }
    renderBoard(dom.boardBody, boardMode, 0);
    show('screen-board');
  }

  dom.boardTabs.addEventListener('change', (event) => {
    boardMode = event.target.value;
    renderBoard(dom.boardBody, boardMode, 0);
  });

  dom.boardBtn.addEventListener('click', showBoardScreen);
  dom.boardBack.addEventListener('click', () => show('screen-home'));
  dom.boardClear.addEventListener('click', () => {
    Scores.clear(boardMode);
    showBoardScreen();
  });

  dom.scoreEntry.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = dom.playerName.value.trim();
    if (!name) return dom.playerName.focus();

    rememberName(name);
    const { rank, stored } = Scores.add(state.mode, { name, ...state.run });
    dom.scoreEntry.hidden = true;
    renderBoard(dom.endBoard, state.mode, rank);

    if (!stored) {
      const warn = document.createElement('p');
      warn.className = 'hint';
      warn.textContent =
        'Le navigateur refuse le stockage : ce score ne survivra pas au rechargement.';
      dom.endBoard.appendChild(warn);
    } else if (rank) {
      dom.finalScore.textContent += ` — ${ordinal(rank)} place`;
    }
  });

  /* ── Câblage ────────────────────────────── */

  dom.setup.addEventListener('submit', startGame);

  dom.answerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const country = dom.countryInput.value.trim();
    if (!country) return dom.countryInput.focus();
    const year = state.mode === 'expert' ? Number(dom.yearInput.value) || null : null;
    submitAnswer({ country, year });
  });

  dom.skipBtn.addEventListener('click', () => submitAnswer(null));
  dom.nextBtn.addEventListener('click', next);
  dom.replayBtn.addEventListener('click', () => {
    state.queue = shuffle(state.queue);
    state.index = 0;
    state.score = 0;
    state.results = [];
    askQuestion();
  });
  dom.homeBtn.addEventListener('click', () => show('screen-home'));

  /* ── Amorçage ───────────────────────────── */

  Data.load()
    .then((loaded) => {
      data = loaded;
      buildEditionChips();

      dom.yearInput.innerHTML =
        '<option value="">Année…</option>' +
        data.worldCupYears.map((y) => `<option value="${y}">${y}</option>`).join('');

      refreshSetup();
    })
    .catch((err) => {
      document.getElementById('app').innerHTML =
        `<h1>Données illisibles</h1><pre style="white-space:pre-wrap">${err.message}</pre>` +
        '<p>Si tu ouvres le fichier directement depuis le disque, lance plutôt un serveur local :' +
        ' <code>python3 -m http.server</code> puis <code>http://localhost:8000</code>.</p>';
    });
})();
