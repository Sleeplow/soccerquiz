const { test, expect } = require('@playwright/test');
const { QuizPage } = require('../pages/QuizPage');

/** Deux rectangles se chevauchent-ils de plus de `slack` pixels sur les deux axes ? */
function overlaps(a, b, slack = 2) {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > slack && y > slack;
}

test.describe('Placement sur le terrain', () => {
  test('aucun joueur n\'en chevauche un autre ni ne sort du terrain', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();

    // On parcourt toutes les équipes : chaque dispositif a sa géométrie.
    const teams = await page.evaluate(async () => {
      const data = await Data.load();
      return data.questions.map((q) => `${q.country} ${q.year}`);
    });
    expect(teams.length).toBeGreaterThan(5);

    const problems = await page.evaluate(async () => {
      const data = await Data.load();
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('is-active'));
      document.getElementById('screen-reveal').classList.add('is-active');
      const host = document.getElementById('pitch-reveal');
      const found = [];

      for (const question of data.questions) {
        // Les libellés de la révélation sont le cas le plus dense : c'est là
        // que la géométrie casse en premier.
        Pitch.render(host, question, 'players');
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

        for (let i = 0; i < boxes.length; i++) {
          const a = boxes[i];
          if (a.top < pitch.top - 1 || a.bottom > pitch.bottom + 1 ||
              a.left < pitch.left - 1 || a.right > pitch.right + 1) {
            found.push(`${question.country} ${question.year} : ${a.who} sort du terrain`);
          }
          for (let j = i + 1; j < boxes.length; j++) {
            const b = boxes[j];
            const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (x > 2 && y > 2) {
              found.push(`${question.country} ${question.year} : ${a.who} chevauche ${b.who}`);
            }
          }
        }
      }
      return found;
    });

    expect(problems).toEqual([]);
  });

  test('un dispositif documenté place chaque joueur à son poste', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();

    const shape = await page.evaluate(async () => {
      const data = await Data.load();
      const france = data.questions.find((q) => q.country === 'France' && q.year === 2022);
      const host = document.createElement('div');
      host.style.cssText = 'position:relative;width:500px;height:700px';
      document.body.appendChild(host);
      Pitch.render(host, france, 'none');
      return [...host.querySelectorAll('.slot')].map((slot, i) => ({
        pos: france.lineup[i].pos,
        y: parseFloat(slot.style.top)
      }));
    });

    const at = (pos) => shape.filter((s) => s.pos === pos).map((s) => s.y);
    // Le gardien est le plus bas, l'attaquant le plus haut, la défense entre
    // les deux : le 4-2-3-1 doit se lire dans les ordonnées.
    expect(Math.min(...at('GK'))).toBeGreaterThan(Math.max(...at('CB')));
    expect(Math.max(...at('CB'))).toBeGreaterThan(Math.max(...at('DM')));
    expect(Math.max(...at('DM'))).toBeGreaterThan(Math.max(...at('AM')));
    expect(Math.max(...at('AM'))).toBeGreaterThan(Math.max(...at('ST')));
  });

  test('le cadrage montre les trois quarts du terrain, pas le terrain entier', async ({ page }) => {
    const quiz = new QuizPage(page);
    await quiz.goto();
    await quiz.start({ years: [2022, 2018] });

    /* Sur un terrain complet, les onze se tassent dans le bas de l'image et
       un défenseur se lit comme un milieu. Le cadre s'arrête donc au premier
       quart du camp adverse : la surface de réparation d'en face est hors
       champ, et la ligne médiane est visible. */
    const marks = await page.evaluate(() => {
      const svg = document.querySelector('#pitch svg.markings');
      const box = svg.getAttribute('viewBox').split(' ').map(Number);
      return {
        height: box[3],
        rects: [...svg.querySelectorAll('rect')].map((r) => Number(r.getAttribute('y'))),
        lines: [...svg.querySelectorAll('line')].map((l) => Number(l.getAttribute('y1')))
      };
    });

    // Une seule surface de réparation, et elle est dans la moitié basse.
    expect(marks.rects).toHaveLength(2);
    for (const y of marks.rects) expect(y).toBeGreaterThan(marks.height / 2);
    // La ligne médiane est dans le champ, vers le haut.
    expect(marks.lines).toHaveLength(1);
    expect(marks.lines[0]).toBeGreaterThan(0);
    expect(marks.lines[0]).toBeLessThan(marks.height / 2);

    // Le gardien est près de sa ligne, les attaquants au-delà du milieu.
    const ys = await page.evaluate(() =>
      [...document.querySelectorAll('#pitch .slot')].map((s) => parseFloat(s.style.top)));
    expect(Math.max(...ys)).toBeGreaterThan(85);
    expect(Math.min(...ys)).toBeLessThan(marksMedianShare(marks));
    function marksMedianShare(m) { return (m.lines[0] / m.height) * 100; }
  });
});
