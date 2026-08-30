const { test, expect } = require('@playwright/test');
const { QuizPage } = require('../pages/QuizPage');

/* Audit des chemins de clic : pour chaque bouton, l'état final est-il celui
   que son libellé promet, et une action tardive peut-elle défaire la
   précédente ? Ces tests figent les réponses trouvées à la lecture des
   gestionnaires. */

test.describe('Chemins de clic', () => {
  test('une question ne peut être validée qu\'une seule fois', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018], questions: '5' });

    /* Le clic du joueur et l'expiration du chrono visent la même question : si
       l'un arrive après l'autre, la question compterait deux fois. On rejoue
       la course en envoyant deux validations d'affilée. */
    await quiz.countryInput.fill('Islande');
    await page.evaluate(() => {
      const form = document.getElementById('answer-form');
      form.requestSubmit();
      form.requestSubmit();          // clic resté dans la file
      document.getElementById('skip-btn').click();
    });

    await expect(quiz.revealScreen).toBeVisible();
    await quiz.nextButton.click();
    // La deuxième validation aurait sauté une question sans l'afficher.
    await expect(page.locator('#hud-index')).toHaveText('2');

    await quiz.playThrough({ correct: false });
    await expect(page.locator('#recap li')).toHaveCount(5);
  });

  test('le chrono ne rejoue pas une question déjà répondue', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018], questions: '5', timer: '20' });

    await quiz.answer('Islande');
    const first = await quiz.verdict.textContent();

    // Le chrono continuerait de tourner : on lui laisse le temps de se manifester.
    await page.waitForTimeout(600);
    await expect(quiz.revealScreen).toBeVisible();
    await expect(quiz.verdict).toHaveText(first);
    await expect(page.locator('#recap li')).toHaveCount(0);
  });

  test('effacer un classement demande une confirmation', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018], questions: '5' });
    await quiz.playThrough();
    await quiz.playerName.fill('Audit');
    await quiz.saveScore.click();
    await expect(quiz.endBoardRows).toHaveCount(1);

    await page.locator('#home-btn').click();
    await quiz.boardButton.click();
    await expect(quiz.boardRows).toHaveCount(1);

    // Premier clic : le bouton s'arme, rien n'est perdu.
    await quiz.boardClear.click();
    await expect(quiz.boardClear).toHaveClass(/is-armed/);
    await expect(quiz.boardRows).toHaveCount(1);

    // Quitter l'écran désarme : on ne revient pas sur un bouton piégé.
    await page.locator('#board-back').click();
    await quiz.boardButton.click();
    await expect(quiz.boardClear).not.toHaveClass(/is-armed/);
    await expect(quiz.boardRows).toHaveCount(1);

    await quiz.boardClear.click();
    await quiz.boardClear.click();
    await expect(quiz.boardRows).toHaveCount(0);
  });

  test('changer d\'onglet désarme le bouton d\'effacement', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.boardButton.click();

    await quiz.boardClear.click();
    await expect(quiz.boardClear).toHaveClass(/is-armed/);

    // Le bouton visait le classement normal : il ne doit pas viser l'expert.
    await page.locator('#board-tabs input[value="expert"]').check({ force: true });
    await expect(quiz.boardClear).not.toHaveClass(/is-armed/);
  });

  test('« Rejouer » remet le score à zéro sans changer les réglages', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ mode: 'expert', years: [2022, 2018], questions: '5' });
    await quiz.playThrough();

    const before = await quiz.finalScore.textContent();
    await page.locator('#replay-btn').click();

    await expect(quiz.playScreen).toBeVisible();
    await expect(page.locator('#hud-index')).toHaveText('1');
    await expect(page.locator('#hud-score')).toHaveText('0 pt');
    // Le mode est conservé : le champ « année » reste de la partie.
    await expect(quiz.yearInput).toBeVisible();

    await quiz.playThrough({ correct: false });
    // Le total ne s'ajoute pas à celui de la partie précédente.
    expect(await quiz.finalScore.textContent()).not.toBe(before);
    await expect(quiz.finalScore).toContainText(/^0 pts/);
  });

  test('« Changer les réglages » rend la main sans effacer les choix', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ mode: 'expert', years: [2022, 2018], questions: '5', timer: '20' });
    await quiz.playThrough({ correct: false });

    await page.locator('#home-btn').click();
    await expect(page.locator('#screen-home')).toHaveClass(/is-active/);

    // Les réglages sont ceux qu'on vient de jouer, pas ceux du premier chargement.
    await expect(page.locator('input[name="mode"][value="expert"]')).toBeChecked();
    await expect(quiz.questionCount).toHaveValue('5');
    await expect(quiz.timerSeconds).toHaveValue('20');
    const checked = await page.locator('#edition-filter input:checked').count();
    expect(checked).toBe(2);
  });

  test('l\'aide ne se paie qu\'une fois et repart à chaque question', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018], questions: '5' });

    await quiz.hintButton.click();
    await expect(quiz.hintButton).toBeDisabled();
    await expect(page.locator('#pitch .slot-label')).toHaveCount(11);

    const truth = await quiz.solveCurrent();
    await quiz.answer(truth || 'Islande');
    // 100 + 0 de rapidité (sans chrono) − 30 d'aide.
    if (truth) await expect(quiz.verdict).toContainText('70 pts');

    await quiz.nextButton.click();
    await expect(quiz.hintButton).toBeEnabled();
    await expect(page.locator('#pitch .slot-label')).toHaveCount(0);
  });
});
