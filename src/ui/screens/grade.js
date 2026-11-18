// Klassenstufe (Plan Etappe 7): zwei große Felder. Seit Phase 6b hat Klasse 4 eigene Aufgaben.
import { addWorld } from '../components/world.js?v=1ea03785';

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
