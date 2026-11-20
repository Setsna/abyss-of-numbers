// Heldenwahl (Plan Etappe 7): vier Figuren zum Antippen, Name aus zwei Wortlisten mit je einem Knopf
// „anderes Wort“ und einem Würfel für beide. Keine Texteingabe (Konzept 10, Datenschutz).
// Der Würfel nutzt Math.random: nur Oberfläche, der Spielstand bekommt ohnehin nur die zwei Nummern.
import { ICON } from '../icons.js?v=dc004222';
import { renderAsset } from '../assets.js?v=dc004222';
import { addWorld } from '../components/world.js?v=dc004222';

// Ändern-Modus (initial, onCancel; seit 18.11.2026): gleiche Wahl aus dem Logbuch, die jetzige Figur und der
// jetzige Name sind vorausgewählt, dazu ein Knopf „Zurück“.
export function mountHeroCreate(root, { t, config, onDone, initial = null, onCancel = null, areaId = null }) {
  const figures = Object.keys(config.heroes.figures);
  const { nameA, nameB } = config.heroes;
  let figure = initial?.figur ?? figures[0];
  let a = initial?.nameA ?? 0;
  let b = initial?.nameB ?? 0;

  root.innerHTML = `
  <main class="screen hero-screen">
    <section class="panel menu-panel hero-panel">
      <h1 class="menu-title" data-ref="title"></h1>
      <div class="figures" data-ref="figures"></div>
      <p class="name-label" data-ref="nameLabel"></p>
      <div class="name-row">
        <div class="name-part"><span class="name-word" data-ref="wordA"></span><button class="btn btn-quiet name-other" type="button" data-ref="otherA"></button></div>
        <div class="name-part"><span class="name-word" data-ref="wordB"></span><button class="btn btn-quiet name-other" type="button" data-ref="otherB"></button></div>
        <button class="btn btn-quiet name-dice" type="button" data-ref="dice"></button>
      </div>
      <div class="hero-actions">
        <button class="btn" type="button" data-ref="cancel" hidden></button>
        <button class="btn btn-go" type="button" data-ref="done"></button>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  addWorld(root.querySelector('.screen'), `area.${areaId ?? config.areas.order[0]}`); // Spielwelt dahinter (D25)
  ref.title.textContent = t(initial ? 'heroCreate.titleEdit' : 'heroCreate.title');
  if (onCancel) {
    ref.cancel.hidden = false;
    ref.cancel.textContent = t('logbook.close');
    ref.cancel.addEventListener('click', () => {
      root.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      onCancel();
    }, { once: true });
  }
  ref.nameLabel.textContent = t('heroCreate.name');
  ref.otherA.textContent = t('heroCreate.other');
  ref.otherB.textContent = t('heroCreate.other');
  ref.dice.innerHTML = `${ICON.dice}<span></span>`;
  ref.dice.lastChild.textContent = t('heroCreate.dice');
  ref.done.textContent = t('heroCreate.done');

  ref.figures.replaceChildren(...figures.map((id) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'figure';
    btn.dataset.id = id;
    const name = t(`figures.${id}.name`);
    btn.setAttribute('aria-label', t('heroCreate.figureLabel', { name }));
    const art = document.createElement('span');
    art.className = 'figure-art';
    art.append(renderAsset(config.heroes.figures[id].asset, name));
    const label = document.createElement('span');
    label.className = 'figure-name';
    label.textContent = name;
    // Stärke der Figur (Phase 5, Etappe 7)
    const perk = document.createElement('span');
    perk.className = 'figure-perk';
    perk.textContent = t(`perks.${id}`);
    btn.append(art, label, perk);
    btn.setAttribute('aria-label', `${t('heroCreate.figureLabel', { name })}, ${t(`perks.${id}`)}`);
    btn.addEventListener('click', () => { figure = id; render(); });
    return btn;
  }));

  function render() {
    for (const btn of ref.figures.children) btn.setAttribute('aria-pressed', String(btn.dataset.id === figure));
    ref.wordA.textContent = nameA[a];
    ref.wordB.textContent = nameB[b];
  }

  ref.otherA.addEventListener('click', () => { a = (a + 1) % nameA.length; render(); });
  ref.otherB.addEventListener('click', () => { b = (b + 1) % nameB.length; render(); });
  ref.dice.addEventListener('click', () => {
    a = Math.floor(Math.random() * nameA.length);
    b = Math.floor(Math.random() * nameB.length);
    render();
  });
  ref.done.addEventListener('click', () => {
    root.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    onDone({ figureId: figure, nameA: a, nameB: b });
  }, { once: true });
  render();
}

