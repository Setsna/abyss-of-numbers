// Klassenstufe (Plan Etappe 7): zwei große Felder. Bei Klasse 4 kurzer Hinweis „Klasse 4 folgt“.
import { addWorld } from '../components/world.js';

export function mountGrade(root, { t, config, onChoose }) {
  root.innerHTML = `
  <main class="screen grade-screen">
    <section class="panel menu-panel">
      <h1 class="menu-title"></h1>
      <div class="grade-choices">
        <button class="grade-choice" type="button" data-grade="3"></button>
        <button class="grade-choice" type="button" data-grade="4"></button>
      </div>
    </section>
  </main>`;
  if (config) addWorld(root.querySelector('.screen'), `area.${config.areas.order[0]}`); // Spielwelt dahinter (D25)
  root.querySelector('.menu-title').textContent = t('grade.ask');
  for (const b of root.querySelectorAll('.grade-choice')) {
    b.textContent = t(`grade.k${b.dataset.grade}`);
    b.addEventListener('click', () => {
      root.querySelectorAll('.grade-choice').forEach((x) => { x.disabled = true; });
      onChoose(Number(b.dataset.grade));
    }, { once: true });
  }
}

// Hinweis nach der Wahl von Klasse 4; „Verstanden“ führt weiter.
export function mountGradeNotice(root, { t, onOk }) {
  root.innerHTML = `
  <main class="screen grade-screen">
    <section class="panel menu-panel">
      <p class="menu-text"></p>
      <button class="btn btn-go" type="button"></button>
    </section>
  </main>`;
  root.querySelector('.menu-text').textContent = t('grade.notice4');
  const ok = root.querySelector('button');
  ok.textContent = t('grade.ok');
  ok.addEventListener('click', () => { ok.disabled = true; onOk(); }, { once: true });
  ok.focus({ preventScroll: true });
}
