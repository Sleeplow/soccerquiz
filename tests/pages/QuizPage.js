/**
 * Modèle Page Object du quiz.
 *
 * Toute la connaissance des sélecteurs et du déroulé vit ici : les tests
 * décrivent une intention, pas des clics. Quand l'interface bouge, un seul
 * fichier change.
 */
class QuizPage {
  constructor(page) {
    this.page = page;

    // Accueil
    this.poolInfo = page.locator('#pool-info');
    this.startButton = page.locator('#setup button[type="submit"]');
    this.expertWarning = page.locator('#expert-warning');
    this.boardButton = page.locator('#board-btn');
    this.questionCount = page.locator('#question-count');
    this.timerSeconds = page.locator('#timer-seconds');

    // Question
    this.playScreen = page.locator('#screen-play');
    this.pitch = page.locator('#pitch');
    this.slots = page.locator('#pitch .slot');
    this.badges = page.locator('#pitch .slot-badge');
    this.countryInput = page.locator('#country-input');
    this.countryOptions = page.locator('#country-list li');
    this.yearInput = page.locator('#year-input');
    this.submitButton = page.locator('#answer-form button[type="submit"]');
    this.skipButton = page.locator('#skip-btn');
    this.hintButton = page.locator('#hint-btn');

    // Révélation
    this.revealScreen = page.locator('#screen-reveal');
    this.verdict = page.locator('#verdict');
    this.revealCaption = page.locator('#reveal-caption');
    this.revealSlots = page.locator('#pitch-reveal .slot');
    this.nextButton = page.locator('#next-btn');

    // Fin et classement
    this.endScreen = page.locator('#screen-end');
    this.finalScore = page.locator('#final-score');
    this.scoreEntry = page.locator('#score-entry');
    this.playerName = page.locator('#player-name');
    this.saveScore = page.locator('#score-entry button[type="submit"]');
    this.endBoardRows = page.locator('#end-board .board li');
    this.boardScreen = page.locator('#screen-board');
    this.boardRows = page.locator('#board-body .board li');
    this.boardClear = page.locator('#board-clear');
  }

  /**
   * Ouvre le jeu en coupant l'accès à Wikipédia : les blasons distants ne
   * doivent jamais décider du résultat d'un test. Le repli en pastilles est le
   * comportement attendu, et il est déterministe.
   */
  async goto({ offline = true } = {}) {
    if (offline) {
      await this.page.route('**/*.wikipedia.org/**', (route) => route.abort('failed'));
      await this.page.route('**/*.wikimedia.org/**', (route) => route.abort('failed'));
    }
    // Playwright isole le contexte de chaque test : le stockage part déjà vide.
    // Le vider explicitement effacerait aussi ce que l'application écrit
    // légitimement, et casserait les tests de persistance.
    await this.page.goto('/index.html');
    await this.poolInfo.filter({ hasText: 'équipe' }).waitFor();
  }

  /** @param {{mode?: 'normal'|'expert', years?: number[], questions?: string, timer?: string}} options */
  async start({ mode = 'normal', years = null, questions = '5', timer = '0' } = {}) {
    await this.page.check(`input[name="mode"][value="${mode}"]`, { force: true });

    if (years) {
      const boxes = this.page.locator('#edition-filter input');
      for (let i = 0; i < await boxes.count(); i++) {
        const box = boxes.nth(i);
        const year = Number(await box.getAttribute('value'));
        await box.setChecked(years.includes(year), { force: true });
      }
    }

    await this.questionCount.selectOption(questions);
    await this.timerSeconds.selectOption(timer);
    await this.startButton.click();
    await this.playScreen.waitFor({ state: 'visible' });
  }

  async openCountryList() {
    await this.countryInput.click();
    await this.page.locator('#country-list').waitFor({ state: 'visible' });
    return this.countryOptions.allTextContents();
  }

  async answer(country) {
    await this.countryInput.fill(country);
    await this.countryInput.press('Escape');
    await this.submitButton.click();
    await this.revealScreen.waitFor({ state: 'visible' });
  }

  /**
   * La bonne réponse de la question affichée, déduite des monogrammes des
   * clubs. Permet de piloter le score sans exposer l'état interne du jeu.
   * Renvoie null pour une équipe dont le onze est tiré au sort.
   */
  solveCurrent() {
    return this.page.evaluate(async () => {
      const shown = [...document.querySelectorAll('#pitch .slot-mono')]
        .map((e) => e.textContent).sort().join('|');
      const data = await Data.load();
      const match = data.questions.find((q) =>
        q.lineup
          .map((p) => p.club.mono || p.club.name.slice(0, 3).toUpperCase())
          .sort().join('|') === shown);
      return match ? match.country : null;
    });
  }

  /** Enchaîne toute la partie. `correct: false` répond volontairement à côté. */
  async playThrough({ correct = true } = {}) {
    for (let guard = 0; guard < 30; guard++) {
      if (await this.endScreen.isVisible()) break;
      await this.playScreen.waitFor({ state: 'visible' });
      const truth = correct ? await this.solveCurrent() : null;
      await this.answer(truth || 'Islande');
      if (await this.endScreen.isVisible()) break;
      await this.nextButton.click();
    }
    if (!(await this.endScreen.isVisible())) await this.nextButton.click();
    await this.endScreen.waitFor({ state: 'visible' });
  }

  /** Rectangles réellement peints par chaque joueur : pastille et libellés. */
  inkBoxes(container = '#pitch') {
    return this.page.evaluate((sel) =>
      [...document.querySelectorAll(`${sel} .slot`)].map((slot) => {
        const parts = [...slot.querySelectorAll('.slot-badge, .slot-label, .slot-sub')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0);   // ignorer ce qui est masqué
        return {
          top: Math.min(...parts.map((r) => r.top)),
          bottom: Math.max(...parts.map((r) => r.bottom)),
          left: Math.min(...parts.map((r) => r.left)),
          right: Math.max(...parts.map((r) => r.right))
        };
      }), container);
  }

  pitchBox(container = '#pitch') {
    return this.page.locator(container).boundingBox();
  }

  /**
   * Passe toutes les compositions sur un même terrain et relève ce qui se
   * chevauche ou sort du cadre.
   *
   * Le parcours se fait dans la page : mesurer quatre-vingts équipes une par
   * une depuis le test ferait autant d'allers-retours pour la même réponse.
   * Le compte d'équipes est rendu avec les problèmes — sans lui, une passe
   * qui n'a rien dessiné se lit exactement comme une passe sans défaut.
   *
   * @param {'none'|'clubs'|'players'} labels — `players` est le cas le plus
   *        dense, c'est là que la géométrie casse en premier.
   * @returns {Promise<{teams: number, problems: string[]}>}
   */
  pitchSweep(labels = 'players') {
    return this.page.evaluate(async (mode) => {
      const data = await Data.load();
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('is-active'));
      document.getElementById('screen-reveal').classList.add('is-active');
      const host = document.getElementById('pitch-reveal');
      const problems = [];

      for (const question of data.questions) {
        Pitch.render(host, question, mode);
        const pitch = host.getBoundingClientRect();
        const boxes = [...host.querySelectorAll('.slot')].map((slot, i) => {
          const parts = [...slot.querySelectorAll('.slot-badge, .slot-label, .slot-sub')]
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0);
          return {
            who: `${question.lineup[i].name}/${question.lineup[i].pos}`,
            top: Math.min(...parts.map((r) => r.top)),
            bottom: Math.max(...parts.map((r) => r.bottom)),
            left: Math.min(...parts.map((r) => r.left)),
            right: Math.max(...parts.map((r) => r.right))
          };
        });

        const where = `${question.country} ${question.year}`;
        for (let i = 0; i < boxes.length; i++) {
          const a = boxes[i];
          if (a.top < pitch.top - 1 || a.bottom > pitch.bottom + 1 ||
              a.left < pitch.left - 1 || a.right > pitch.right + 1) {
            problems.push(`${where} : ${a.who} sort du terrain`);
          }
          for (let j = i + 1; j < boxes.length; j++) {
            const b = boxes[j];
            const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (x > 2 && y > 2) problems.push(`${where} : ${a.who} chevauche ${b.who}`);
          }
        }
      }
      return { teams: data.questions.length, problems };
    }, labels);
  }

  /** Diamètre de la plus petite et de la plus grande pastille du terrain. */
  badgeSizes(container = '#pitch') {
    return this.page.evaluate((sel) => {
      const widths = [...document.querySelectorAll(`${sel} .slot-badge`)]
        .map((b) => b.getBoundingClientRect().width);
      return { count: widths.length, min: Math.min(...widths), max: Math.max(...widths) };
    }, container);
  }
}

module.exports = { QuizPage };
