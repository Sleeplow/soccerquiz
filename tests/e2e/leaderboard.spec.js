const { test, expect } = require('@playwright/test');
const { QuizPage } = require('../pages/QuizPage');

const entry = (over) => ({
  name: 'Joueur', score: 100, max: 1000, questions: 5, correct: 3, years: [2022], ...over
});

test.describe('Classement', () => {
  test('un score nul ne demande pas de nom', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018, 2014, 2010] });
    await quiz.playThrough({ correct: false });

    await expect(quiz.finalScore).toContainText('0 pts');
    await expect(quiz.scoreEntry).toBeHidden();
  });

  test('une partie gagnée est enregistrée, classée et mise en avant', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018, 2014, 2010] });
    await quiz.playThrough();

    await expect(quiz.scoreEntry).toBeVisible();
    await quiz.playerName.fill('Testeur');
    await quiz.saveScore.click();

    await expect(quiz.scoreEntry).toBeHidden();
    await expect(quiz.finalScore).toContainText('1re place');
    await expect(page.locator('#end-board .board li.is-new .board-name')).toHaveText('Testeur');
  });

  test('ne garde que dix places, triées par score', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();

    const state = await page.evaluate((make) => {
      for (let i = 1; i <= 12; i++) Scores.add('normal', { ...make, name: `J${i}`, score: i * 100 });
      const list = Scores.list('normal');
      return { count: list.length, first: list[0].score, last: list[list.length - 1].score };
    }, entry());

    expect(state.count).toBe(10);
    expect(state.first).toBe(1200);
    expect(state.last).toBe(300);
  });

  test('refuse un score sous la dixième place et un score nul', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();

    const verdicts = await page.evaluate((make) => {
      for (let i = 1; i <= 10; i++) Scores.add('normal', { ...make, name: `J${i}`, score: i * 100 });
      return {
        tooLow: Scores.qualifies('normal', 50),
        highEnough: Scores.qualifies('normal', 1500),
        zero: Scores.qualifies('normal', 0)
      };
    }, entry());

    expect(verdicts).toEqual({ tooLow: false, highEnough: true, zero: false });
  });

  test('un nom contenant du balisage reste du texte', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();

    await page.evaluate((make) => {
      Scores.add('expert', { ...make, name: '<img src=x onerror=alert(1)>', score: 500 });
    }, entry());

    await quiz.boardButton.click();
    await page.check('#board-tabs input[value="expert"]', { force: true });

    await expect(page.locator('#board-body .board-name')).toContainText('<img src=x');
    // Le balisage ne doit produire aucun élément réel.
    await expect(page.locator('#board-body img')).toHaveCount(0);
  });

  test('le classement survit au rechargement et peut être effacé', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await page.evaluate((make) => Scores.add('normal', { ...make, name: 'Persistant' }), entry());

    await page.reload();
    await quiz.poolInfo.filter({ hasText: 'équipe' }).waitFor();
    await quiz.boardButton.click();
    await expect(quiz.boardRows).toHaveCount(1);
    await expect(page.locator('#board-body .board-name')).toHaveText('Persistant');

    // L'effacement se fait en deux temps : armer, puis confirmer.
    await quiz.boardClear.click();
    await quiz.boardClear.click();
    await expect(quiz.boardRows).toHaveCount(0);
  });
});
