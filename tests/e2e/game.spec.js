const { test, expect } = require('@playwright/test');
const { QuizPage } = require('../pages/QuizPage');

test.describe('Déroulé d\'une partie', () => {
  test('pose onze blasons sans révéler les noms', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start();

    await expect(quiz.slots).toHaveCount(11);
    // Les libellés ne doivent apparaître qu'après l'aide ou la révélation.
    await expect(page.locator('#pitch .slot-label')).toHaveCount(0);
  });

  test('l\'aide affiche les noms de clubs et se désactive', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start();

    await quiz.hintButton.click();
    await expect(page.locator('#pitch .slot-label')).toHaveCount(11);
    await expect(quiz.hintButton).toBeDisabled();
  });

  test('une bonne réponse marque des points, une mauvaise non', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    // 2026 tire son onze au sort : on l'exclut pour rendre la réponse déductible.
    await quiz.start({ years: [2022, 2018, 2014, 2010] });

    const truth = await quiz.solveCurrent();
    expect(truth, 'la question doit être identifiable depuis les blasons').toBeTruthy();

    await quiz.answer(truth);
    await expect(quiz.verdict).toContainText('Bien vu');
    await expect(quiz.revealSlots).toHaveCount(11);
    await expect(quiz.revealCaption).toContainText(truth);
  });

  test('passer la question révèle la réponse sans marquer', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start();

    await quiz.skipButton.click();
    await expect(quiz.revealScreen).toBeVisible();
    await expect(quiz.verdict).toContainText('Raté');
  });

  test('une partie complète mène au récapitulatif', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018, 2014, 2010] });
    await quiz.playThrough();

    await expect(quiz.finalScore).toContainText(/\d+ pts sur \d+ possibles/);
    await expect(page.locator('#recap li')).toHaveCount(5);
  });

  test('sans chrono, le maximum affiché exclut la prime de rapidité', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018, 2014, 2010], questions: '5', timer: '0' });
    await quiz.playThrough();

    // 5 questions × 100 points : la prime, inatteignable, ne doit pas compter.
    await expect(quiz.finalScore).toContainText('sur 500 possibles');
  });
});
