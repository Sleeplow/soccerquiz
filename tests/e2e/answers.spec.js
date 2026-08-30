const { test, expect } = require('@playwright/test');
const { QuizPage } = require('../pages/QuizPage');

test.describe('Liste des réponses', () => {
  test('propose les participants de l\'année, pas seulement les équipes jouables', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022] });

    const options = await quiz.openCountryList();
    expect(options).toHaveLength(32);
    // Le Qatar a joué 2022 sans qu'une question porte sur lui : sa présence
    // prouve que la liste ne se limite pas au jeu de questions.
    expect(options).toContain('Qatar');
    // L'Italie ne s'était pas qualifiée : elle ne doit pas être proposée.
    expect(options).not.toContain('Italie');
  });

  test('le filtre au clavier ignore les accents', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022] });

    await quiz.countryInput.fill('bresil');
    await expect(quiz.countryOptions).toHaveText(['Brésil']);
  });

  test('en expert, l\'année choisie restreint les sélections', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ mode: 'expert', years: [2022, 2010] });

    const union = await quiz.openCountryList();
    expect(union.length).toBeGreaterThan(32);
    expect(union).toContain('Qatar');      // 2022 seulement
    expect(union).toContain('Slovénie');   // 2010 seulement

    await quiz.yearInput.selectOption('2010');
    const only2010 = await quiz.openCountryList();
    expect(only2010).toContain('Slovénie');
    expect(only2010).not.toContain('Qatar');
  });

  test('changer d\'année efface une réponse devenue impossible', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ mode: 'expert', years: [2022, 2010] });

    await quiz.yearInput.selectOption('2010');
    await quiz.countryInput.fill('Slovénie');
    await quiz.yearInput.selectOption('2022');
    await expect(quiz.countryInput).toHaveValue('');
  });

  test('2026 propose ses quarante-huit qualifiés', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2026] });

    const options = await quiz.openCountryList();
    expect(options).toHaveLength(48);
    // Le tournoi passe de 32 à 48 équipes : des sélections absentes en 2022
    // apparaissent, et la liste doit les proposer.
    expect(options).toContain('Curaçao');
    expect(options).toContain('Ouzbékistan');
    // L'Italie a encore manqué la qualification.
    expect(options).not.toContain('Italie');
  });

  test('une édition sans participants connus retombe sur le référentiel complet', async ({ page }) => {
    /* Toutes les éditions ont aujourd'hui leur liste de qualifiés. Le repli
       reste indispensable pour la prochaine édition importée sans elle : on
       sert donc une donnée amputée plutôt que d'attendre qu'elle survienne. */
    await page.route('**/data/editions.json', async (route) => {
      const response = await route.fetch();
      const document = await response.json();
      for (const edition of document.editions) {
        if (edition.year === 2026) delete edition.participants;
      }
      await route.fulfill({ response, json: document });
    });

    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2026] });

    const options = await quiz.openCountryList();
    // Sans repli, la liste tomberait aux seules équipes ayant une question :
    // la réponse se lirait dedans.
    expect(options.length).toBeGreaterThan(60);
  });
});
