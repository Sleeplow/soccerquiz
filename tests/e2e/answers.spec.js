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

  test('une édition sans participants connus retombe sur le référentiel complet', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2026] });

    const options = await quiz.openCountryList();
    // 2026 n'a pas encore de liste de participants : la réponse ne doit pas
    // pour autant se déduire d'une liste courte.
    expect(options.length).toBeGreaterThan(60);
  });
});
