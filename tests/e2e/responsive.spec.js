const { test, expect } = require('@playwright/test');
const { QuizPage } = require('../pages/QuizPage');

/* Le terrain garde ses proportions quel que soit l'écran : une pastille
   dimensionnée en pourcentage suit donc la fenêtre, pas l'œil. C'est ce qui
   l'avait réduite à 26 px sur un iPhone quand un moniteur en affichait 61.
   Ces tests tiennent les deux bouts — un blason toujours lisible, et jamais
   de composition qui se chevauche pour autant. */

const ECRANS = [
  { nom: 'iPhone SE',         width: 320,  height: 568 },
  { nom: 'iPhone portrait',   width: 375,  height: 812 },
  { nom: 'iPhone récent',     width: 393,  height: 852 },
  { nom: 'téléphone couché',  width: 852,  height: 393 },
  { nom: 'tablette portrait', width: 768,  height: 1024 },
  { nom: 'portable',          width: 1024, height: 640 },
  { nom: 'moniteur',          width: 1440, height: 900 },
  { nom: 'grand moniteur',    width: 1920, height: 1080 }
];

/* Seuils en pixels, pas en proportion : c'est la taille réelle à l'écran qui
   décide si un écusson se reconnaît. Le plancher est la régression que ces
   tests existent pour empêcher ; le plafond garde la pastille en deçà des
   marquages du terrain, où elle mangerait la surface de réparation. */
const DIAMETRE_MIN = 34;
const DIAMETRE_MAX = 80;

test.describe('Taille des blasons selon l\'écran', () => {
  test('le blason reste lisible du petit téléphone au grand moniteur', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022] });

    const mesures = [];
    for (const ecran of ECRANS) {
      await page.setViewportSize({ width: ecran.width, height: ecran.height });
      // Le calcul se refait sur mesure du terrain : lui laisser une frame.
      await expect.poll(async () => (await quiz.badgeSizes()).count).toBe(11);
      const { min, max } = await quiz.badgeSizes();
      mesures.push({ ...ecran, min: Math.round(min), max: Math.round(max) });
    }

    // Le message porte toutes les mesures : un échec doit dire à quelle
    // largeur ça casse, pas seulement qu'il a cassé quelque part.
    const releve = mesures.map((m) => `${m.nom} (${m.width}×${m.height}) : ${m.min}–${m.max} px`).join('\n');
    for (const m of mesures) {
      expect(m.min, `blason trop petit\n${releve}`).toBeGreaterThanOrEqual(DIAMETRE_MIN);
      expect(m.max, `blason trop gros\n${releve}`).toBeLessThanOrEqual(DIAMETRE_MAX);
    }

    /* Le fond du sujet : un téléphone n'a pas à recevoir une pastille deux
       fois plus petite qu'un moniteur. Le terrain y est plus étroit, donc un
       écart demeure — il reste borné. */
    const telephone = mesures.find((m) => m.nom === 'iPhone récent');
    const moniteur = mesures.find((m) => m.nom === 'moniteur');
    expect(telephone.min / moniteur.min, `\n${releve}`).toBeGreaterThan(0.75);
  });

  test('aucune composition ne déborde ni ne se chevauche, à chaque largeur', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();

    for (const ecran of ECRANS) {
      await page.setViewportSize({ width: ecran.width, height: ecran.height });
      const { teams, problems } = await quiz.pitchSweep('players');
      // Sans ce compte, une passe qui n'a rien dessiné se lirait comme une
      // passe sans défaut.
      expect(teams, `${ecran.nom} : aucune équipe parcourue`).toBeGreaterThan(5);
      expect(problems, `${ecran.nom} (${ecran.width}×${ecran.height})`).toEqual([]);
    }
  });

  test('la page ne défile jamais horizontalement', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022] });

    for (const ecran of ECRANS) {
      await page.setViewportSize({ width: ecran.width, height: ecran.height });
      const debordement = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(debordement, `${ecran.nom} (${ecran.width}×${ecran.height})`).toBeLessThanOrEqual(1);
    }
  });
});
