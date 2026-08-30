const { test, expect } = require('@playwright/test');
const { QuizPage } = require('../pages/QuizPage');

test.describe('Écran de réglages', () => {
  test('annonce le vivier réel une fois les données chargées', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await expect(quiz.poolInfo).toContainText(/\d+ équipes disponibles sur \d+ éditions/);
  });

  test('avertit que le mode expert est creux avec une seule édition', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await page.check('input[name="mode"][value="expert"]', { force: true });

    const boxes = page.locator('#edition-filter input');
    for (let i = 1; i < await boxes.count(); i++) await boxes.nth(i).uncheck({ force: true });
    await expect(quiz.expertWarning).toBeVisible();

    for (let i = 1; i < await boxes.count(); i++) await boxes.nth(i).check({ force: true });
    await expect(quiz.expertWarning).toBeHidden();
  });

  test('refuse de démarrer sans aucune édition', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    const boxes = page.locator('#edition-filter input');
    for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).uncheck({ force: true });
    await expect(quiz.startButton).toBeDisabled();
  });
});
