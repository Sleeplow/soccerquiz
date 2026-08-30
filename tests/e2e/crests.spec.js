const { test, expect } = require('@playwright/test');
const { QuizPage } = require('../pages/QuizPage');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

test.describe('Résolution des blasons', () => {
  test('sans réseau, chaque club retombe sur sa pastille', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();                       // coupe déjà Wikipédia
    await quiz.start();

    await expect(quiz.badges).toHaveCount(11);
    const fallbacks = await page.locator('#pitch .slot-badge[data-fallback]').count();
    expect(fallbacks).toBe(11);
  });

  test('avec l\'API, les blasons sont demandés en lots et mis en cache', async ({ page }) => {
    const calls = [];
    // On sert une réponse minimale : ce qui est vérifié, c'est le regroupement
    // des requêtes et la réutilisation du cache, pas le contenu des images.
    await page.route('**/en.wikipedia.org/w/api.php*', async (route) => {
      const url = new URL(route.request().url());
      calls.push(url.searchParams.get('prop'));
      const titles = (url.searchParams.get('titles') || '').split('|');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          query: {
            redirects: [],
            pages: titles.map((t, i) => ({
              pageid: i, title: t,
              thumbnail: { source: 'https://example.invalid/badge.png' }
            }))
          }
        })
      });
    });
    await page.route('**/example.invalid/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));

    const quiz = new QuizPage(page);
    await quiz.goto({ offline: false });
    await quiz.start();
    await expect(quiz.badges.first()).toBeVisible();

    // Un lot par tranche de 50 titres, jamais une requête par club.
    expect(calls.length).toBeLessThan(5);
    const cached = await page.evaluate(() =>
      Object.keys(JSON.parse(localStorage.getItem('soccerquiz.crests.v1') || '{}')).length);
    expect(cached).toBeGreaterThan(0);

    const before = calls.length;
    await page.reload();
    await quiz.poolInfo.filter({ hasText: 'équipe' }).waitFor();
    // Le cache doit épargner tout nouvel appel.
    expect(calls.length).toBe(before);
  });
});
