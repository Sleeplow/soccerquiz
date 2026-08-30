const { test, expect } = require('@playwright/test');
const { QuizPage } = require('../pages/QuizPage');

/* Contrôles WCAG 2.2 niveau AA que l'on peut vérifier sans lecteur d'écran.
   Ils ne remplacent pas un essai réel, mais ils empêchent les régressions
   silencieuses : contraste, taille des cibles, annonces dynamiques, clavier. */

/** Contraste réel entre deux couleurs calculées par le navigateur. */
const CONTRAST = `(fg, bg) => {
  const parse = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => { const [r, g, b] = parse(c); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}`;

test.describe('Accessibilité', () => {
  test('le texte atteint le contraste AA de 4,5:1', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();

    const results = await page.evaluate(({ contrastSrc }) => {
      const contrast = eval(contrastSrc);
      // Fond effectif d'un élément : on remonte jusqu'à trouver une couleur opaque.
      const backdrop = (el) => {
        for (let node = el; node; node = node.parentElement) {
          const bg = getComputedStyle(node).backgroundColor;
          const alpha = Number((bg.match(/[\d.]+/g) || [])[3] ?? 1);
          if (alpha === 1 && bg !== 'transparent') return bg;
        }
        return 'rgb(10, 16, 51)';   // fond de page
      };

      const samples = [
        ['titre', document.querySelector('h1')],
        ['texte de présentation', document.querySelector('.lede')],
        ['indication sous le bouton', document.querySelector('#pool-info')],
        ['pied de page', document.querySelector('.site-foot p')]
      ];

      return samples.filter(([, el]) => el).map(([nom, el]) => ({
        nom,
        ratio: contrast(getComputedStyle(el).color, backdrop(el))
      }));
    }, { contrastSrc: CONTRAST });

    expect(results.length).toBeGreaterThan(3);
    for (const { nom, ratio } of results) {
      expect(ratio, `contraste insuffisant : ${nom}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('les cibles interactives font au moins 24 pixels', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start();

    const tooSmall = await page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return [...document.querySelectorAll('button, input, select, .chip span, #country-list li')]
        .filter(visible)
        .map((el) => ({
          quoi: el.id || el.className || el.tagName,
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height)
        }))
        // WCAG 2.2 SC 2.5.8 : 24 × 24 pixels CSS minimum.
        .filter((box) => box.w < 24 || box.h < 24);
    });

    expect(tooSmall).toEqual([]);
  });

  test('les changements d\'état sont annoncés', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();

    // Sans région vivante, un lecteur d'écran reste muet quand le verdict
    // tombe ou que la question change.
    for (const id of ['pool-info', 'pitch-caption', 'verdict', 'final-score']) {
      await expect(page.locator(`#${id}`)).toHaveAttribute('role', 'status');
    }
  });

  test('le terrain décrit les clubs qu\'il montre', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018, 2014, 2010] });

    // La question doit exister pour qui ne voit pas les écussons.
    const question = await quiz.pitch.getAttribute('aria-label');
    expect(question).toMatch(/^Onze clubs à identifier : .+,/);

    await quiz.skipButton.click();
    const reveal = await page.locator('#pitch-reveal').getAttribute('aria-label');
    expect(reveal).toMatch(/^Composition de .+ en \d{4} : /);
  });

  test('une partie se joue entièrement au clavier', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018, 2014, 2010] });

    const truth = await quiz.solveCurrent();
    // Le champ reçoit le focus à l'ouverture de la question : la flèche du bas
    // doit ouvrir la liste, sans souris.
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#country-list')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.keyboard.type(truth);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');

    await expect(quiz.revealScreen).toBeVisible();
    await expect(quiz.verdict).toContainText('Bien vu');
  });
});
