// Einstieg: Konfiguration und Bildliste laden, prüfen, Spielstand laden, dann Titel oder (nur lokal) Testkämpfe.
// Testkampf: index.html?dev=combat&enemies=crab,jelly&seed=1  (dazu &zeit=plus50|plus100|noTimer, &calm=1, &stufe=2, &stroemung=1.2, &area=caves, &klasse=4)
// Ohne ?dev=…: Spielablauf über Station und Seekarte.
// Etappe 10 (D37): Vor dem Spiel meldet sich das Kind mit seinem Code an (platform/account.js); der Spielstand
// liegt dann im Konto und wird mit Firebase abgeglichen. Auf localhost ohne Firebase-Attrappe läuft das Spiel
// wie bisher ohne Anmeldung nur im Browser (für Testkämpfe, Klick-Testspieler und Audit-Werkzeuge).
import { loadConfig, browserFetchJson } from './platform/config-loader.js?v=2c640ccc';
import { createStorage, STORAGE_KEY } from './platform/storage.js?v=2c640ccc';
import { createAccount, accountBackend } from './platform/account.js?v=2c640ccc';
import { FIREBASE } from './platform/firebase-config.js?v=2c640ccc';
import { createAudio } from './platform/audio.js?v=2c640ccc';
import { validateConfig } from './engine/config/validate.js?v=2c640ccc';
import { createSave } from './engine/save/save.js?v=2c640ccc';
import { createGame } from './engine/game.js?v=2c640ccc';
import { setTexts, t } from './ui/text.js?v=2c640ccc';
import { setManifest } from './ui/assets.js?v=2c640ccc';
import { isLocalHost } from './ui/app.js?v=2c640ccc';
import { mountCombat } from './ui/screens/combat.js?v=2c640ccc';
import { mountReward } from './ui/screens/reward.js?v=2c640ccc';
import { mountShop } from './ui/screens/shop.js?v=2c640ccc';
import { mountMap, mountAreaCleared } from './ui/screens/map.js?v=2c640ccc';
import { mountBase } from './ui/screens/base.js?v=2c640ccc';
import { mountTitle } from './ui/screens/title.js?v=2c640ccc';
import { mountLogin } from './ui/screens/login.js?v=2c640ccc';
import { mountGrade } from './ui/screens/grade.js?v=2c640ccc';
import { mountHeroCreate } from './ui/screens/hero-create.js?v=2c640ccc';
import { mountLogbook } from './ui/screens/logbook.js?v=2c640ccc';
import { mountAdult } from './ui/screens/adult.js?v=2c640ccc';
import { createRng } from './engine/rng.js?v=2c640ccc';

const app = document.getElementById('app');

// Ton (Phase 5, Etappe 9): erst nach dem ersten Tipp (Safari-Regel); auch nach dem Aufwachen des
// iPads weckt jeder Tipp den Audio-Kontext wieder. Kurzer Klang für Knöpfe außerhalb des Kampfs
// (im Kampf haben Karten und Antworten eigene Klänge).
function setupAudio(config, settings) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const audio = createAudio({
    sounds: config.sounds,
    enabled: settings?.ton ?? true,
    music: settings?.musik ?? true,
    volume: settings?.lautstaerke ?? config.sounds.defaultVolume,
    context: Ctx ? () => new Ctx() : null,
  });
  document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('button');
    if (b && !b.disabled && !b.closest('.stage')) audio.ui('buttonTap');
  }, { capture: true });
  return audio;
}

function showMessage(title, lines = []) {
  app.replaceChildren();
  const h = document.createElement('h1');
  h.textContent = title;
  app.append(h);
  if (lines.length) {
    const list = document.createElement('ul');
    for (const line of lines) { const li = document.createElement('li'); li.textContent = line; list.append(li); }
    app.append(list);
  }
}

function showNotice(text) {
  let el = document.querySelector('.notice');
  if (!el) {
    el = document.createElement('p');
    el.className = 'notice';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = text;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => el.remove(), 6000);
}

// localStorage selbst kann im privaten Modus beim Zugriff werfen.
function browserBackend() {
  try {
    return window.localStorage;
  } catch {
    const fail = () => { throw new Error('kein Speicher'); };
    return { getItem: fail, setItem: fail, removeItem: fail };
  }
}

function openSave(config) {
  const storage = createStorage(browserBackend(), config);
  const { save, status } = storage.load();
  if (status === 'unavailable') showNotice(t('save.unavailable'));
  return { storage, save: save ?? createSave(Date.now(), 3, config), status };
}

function runDevCombats(config, params) {
  const enemies = (params.get('enemies') || 'crab,jelly').split(',').filter((id) => config.enemies[id] || config.bosses.bosses[id]).slice(0, 4);
  if (params.get('calm') === '1') document.body.classList.add('is-calm');
  const { storage, save } = openSave(config);
  const zeit = params.get('zeit');
  if (zeit && config.game.moreTime[zeit] !== undefined) save.einstellung.mehrZeit = zeit;
  if (params.get('klasse') === '4') save.klasse = 4; // Testkampf mit den Aufgaben von Klasse 4 (Phase 6b)
  const game = createGame({ config, save, seed: Number(params.get('seed') || Date.now() % 100000) });
  const audio = setupAudio(config, save.einstellung);
  audio.setScene(params.get('area') || 'reef'); // Testkampf: &area=caves usw. für den Hintergrundklang
  const level = Number(params.get('stufe') || 1);

  const persist = () => {
    if (!storage.write(game.toSave(Date.now()))) showNotice(t('save.unavailable'));
  };

  let screen = null; // aktueller Bildschirm; destroy() meldet Tasten und Zeitleiste ab
  const show = (next) => { screen?.destroy?.(); screen = next; };

  function fight() {
    game.setNow(Date.now());
    // &area=caves usw. wählt auch die Aufgaben des Gebiets (Phase 6b, Gebietsfenster)
    const area = config.class3.areas[params.get('area')] ? params.get('area') : 'reef';
    game.startCombat(enemies.length ? enemies : ['crab'], level, { enemyPower: Number(params.get('stroemung') || 1), areaId: area });
    show(mountCombat(app, {
      config, t, game, audio,
      onWon: () => {
        const { reward } = game.view();
        show(mountReward(app, {
          config, t, reward, levels: game.view().cardLevels,
          onPick: (cardId) => {
            game.setNow(Date.now());
            game.dispatch({ type: 'pickReward', cardId });
            persist();
            fight();
          },
        }));
      },
      onLost: () => { persist(); fight(); },
    }));
  }
  fight();
}

// Spielablauf: Station → Seekarte → Raum → Beute → Seekarte … → Boss → „Gebiet geschafft!“.
// Gespeichert wird bei jedem Schritt, der den Stand ändert (Konzept 6: nach jedem Raum;
// beim Betreten eines Kampfraums schon der Versuch, damit Neuladen eine neue Aufgabenfolge gibt).
function runGame(config, session = null) {
  const backend = session ? accountBackend(session.account.S, STORAGE_KEY, browserBackend()) : browserBackend();
  const storage = createStorage(backend, config);
  const { save, status } = storage.load();
  if (status === 'unavailable') showNotice(t('save.unavailable'));
  const game = createGame({ config, save, seed: Date.now() % 1000000007 });
  const audio = setupAudio(config, save?.einstellung);

  // Vor dem Anlegen des Helden gibt es keinen Stand (toSave liefert null), dann wird nichts geschrieben.
  const persist = () => {
    const out = game.toSave(Date.now());
    if (out && !storage.write(out)) showNotice(t('save.unavailable'));
  };
  const act = (command) => { game.setNow(Date.now()); const events = game.dispatch(command); persist(); audio.events(events); return events; };

  // Einstellungen wirken sofort: „Weniger Bewegung“ über die Klasse is-calm, Ton über die Ton-Schnittstelle.
  const applySettings = () => {
    const s = game.view().settings;
    document.body.classList.toggle('is-calm', Boolean(s.wenigBewegung));
    audio.setEnabled(s.ton);
    audio.setMusic(s.musik);
    audio.setVolume(s.lautstaerke);
  };
  applySettings();

  let screen = null;
  const show = (next) => { screen?.destroy?.(); screen = next; };

  function route() {
    const v = game.view();
    // Hintergrundklang: im Tauchgang das Gebiet, sonst die Station
    audio.setScene(v.run?.areaId ?? v.cleared?.areaId ?? 'base');
    if (v.screen === 'title') {
      show(mountTitle(app, {
        t, hasSave: Boolean(v.profile),
        account: session?.title ?? null,
        onStart: () => { act({ type: 'start' }); route(); },
        onAdult: () => show(mountAdult(app, {
          t, config, game, rng: createRng(Date.now() >>> 0),
          onSetting: (key, value) => { act({ type: 'setSetting', key, value }); applySettings(); },
          // Mit Konto setzt nur die Lehrkraft zurück (Perlentaucher, D37)
          onReset: session ? null : () => {
            game.dispatch({ type: 'resetSave' });
            storage.clear();
            applySettings();
            showNotice(t('adult.done'));
            route();
          },
          onBack: route,
        })),
      }));
    } else if (v.screen === 'grade') {
      show(mountGrade(app, {
        t, config,
        onChoose: (grade) => {
          act({ type: 'chooseGrade', grade });
          route();
        },
      }));
    } else if (v.screen === 'heroCreate') {
      show(mountHeroCreate(app, { t, config, onDone: (hero) => { act({ type: 'createHero', ...hero }); route(); } }));
    } else if (v.screen === 'logbook') {
      show(mountLogbook(app, {
        t, config, game,
        onCommand: (command) => act(command),
        onClose: () => { act({ type: 'closeLogbook' }); route(); },
      }));
    } else if (v.screen === 'base') {
      show(mountBase(app, {
        t, config, game,
        onDive: (areaId) => { act({ type: 'dive', areaId }); route(); },
        onLogbook: (page) => { act({ type: 'openLogbook', page }); route(); },
      }));
    } else if (v.screen === 'map') {
      show(mountMap(app, {
        t, config, game,
        onExplain: (key) => act({ type: 'markExplained', key }),
        onEnter: (events, { stay }) => {
          game.setNow(Date.now());
          persist();
          if (!stay && !events.some((e) => e.type === 'rejected')) route();
        },
        onSurface: () => { act({ type: 'surface' }); route(); },
      }));
    } else if (v.screen === 'combat') {
      show(mountCombat(app, {
        config, t, game, audio,
        tutorial: v.tutorial,
        explained: v.explained,
        onExplain: (key) => act({ type: 'markExplained', key }),
        onWon: () => {
          persist(); // Raum erledigt, Erfahrung und Perlen sind schon verbucht
          show(mountReward(app, {
            config, t, reward: game.view().reward, levels: game.view().cardLevels, areaId: game.view().run?.areaId ?? game.view().cleared?.areaId,
            onPick: (cardId) => {
              game.setNow(Date.now());
              game.dispatch({ type: 'pickReward', cardId });
              persist();
              route();
            },
          }));
        },
        onLost: () => { persist(); route(); },
      }));
    } else if (v.screen === 'reward') {
      // Beute nach einem Schatz (nach einem Kampf zeigt sie onWon)
      show(mountReward(app, {
        config, t, reward: v.reward, levels: v.cardLevels, areaId: v.run?.areaId,
        onPick: (cardId) => { act({ type: 'pickReward', cardId }); route(); },
      }));
    } else if (v.screen === 'shop') {
      show(mountShop(app, {
        t, config, game,
        onCommand: (command) => act(command),
        onLeave: () => { act({ type: 'leaveShop' }); route(); },
      }));
    } else if (v.screen === 'areaCleared') {
      show(mountAreaCleared(app, {
        t, config, cleared: v.cleared, profile: v.profile,
        onDone: () => { act({ type: 'surface' }); route(); },
      }));
    } else {
      showMessage(t('title.name'), [`Bildschirm ${v.screen}`]);
    }
  }
  route();
}

async function boot() {
  let config;
  try {
    config = await loadConfig(browserFetchJson());
    setManifest(await browserFetchJson('')('assets/manifest.json'));
  } catch (err) {
    showMessage('Abyss of Numbers', [String(err.message || err)]);
    return;
  }
  setTexts(config.texts);
  const errors = validateConfig(config);
  if (errors.length > 0) {
    showMessage(t('boot.configError'), errors);
    return;
  }
  document.title = t('title.name');
  const params = new URLSearchParams(location.search);
  if (params.get('dev') === 'combat' && isLocalHost()) {
    runDevCombats(config, params);
    return;
  }
  const LK = window.LagunenKonto;
  if (!LK || (isLocalHost() && !window.ATTRAPPE)) {
    runGame(config);
    return;
  }
  enter(config, LK);
}

// ---------- Anmeldung (Etappe 10) ----------
// Ablauf wie in den anderen Plattformen der Lernlagune (Vorbild Flaschenpost, app.js „starten“):
// Aufkleber-Code (#c=) zuerst, sonst eine gemerkte Anmeldung, sonst die Code-Eingabe. Das Spiel startet erst,
// wenn der Stand aus der Datenbank eingerechnet ist (oder ohne Netz mit dem Stand auf dem Gerät).
const RESTART_FLAG = 'abyss-neustart';

function enter(config, LK) {
  const account = createAccount(LK, FIREBASE);
  const { S, cloud } = account;
  let playing = false;
  let login = null;

  const netText = () => {
    const z = cloud.zustand().art;
    if (z === 'lokal') return t('login.offline');
    if (z === 'fehler') return t('login.failed');
    return '';
  };
  cloud.beiZustand((z) => { if (playing && z.art === 'fehler') showNotice(t('login.failed')); });

  // Die Lehrkraft hat den Stand zurückgesetzt: Das Gerät hat seinen Stand schon verworfen, neu laden.
  cloud.beiNeustart(() => {
    try { sessionStorage.setItem(RESTART_FLAG, '1'); } catch { /* dann ohne Meldung */ }
    location.reload();
  });

  function play(r) {
    if (playing) return;
    playing = true;
    const title = {
      name: r.name,
      onLogout: () => { cloud.abmelden().then(() => location.reload(), () => location.reload()); },
      onNet: (f) => {
        let on = true;
        const update = () => { if (on) f(netText()); };
        cloud.beiZustand(update);
        return () => { on = false; };
      },
    };
    runGame(config, { account, title });
    if (r.gespeichert === false) showNotice(t('save.unavailable'));
    let restarted = false;
    try { restarted = sessionStorage.getItem(RESTART_FLAG) === '1'; sessionStorage.removeItem(RESTART_FLAG); } catch { /* egal */ }
    if (restarted) showNotice(t('login.restarted'));
  }

  function fail(r) {
    // Die Lehrkraft hat den Code gesperrt: nicht auf dem Gerät weiterspielen lassen
    if (r.grund === cloud.TEXT.gesperrt && S.aktiv()) S.abmelden();
    if (login) login.fail(r.grund || cloud.TEXT.sonst);
    else showLogin(r.grund || cloud.TEXT.sonst);
  }

  function showLogin(hint = '', busy = false) {
    login = mountLogin(app, {
      t, hint, busy,
      onSubmit: (code) => cloud.anmelden(code).then((r) => (r.ok ? play(r) : fail(r)), () => fail({ grund: cloud.TEXT.sonst })),
    });
  }

  const LA = LK.adresse;
  const qr = LA.code();
  const spur = LA.spur();
  LA.saeubern();
  if (qr) {
    // Ein gescannter Code hat Vorrang vor dem Kind, das in diesem Tab noch angemeldet ist.
    if (S.aktiv() && S.code() !== qr) S.abmelden();
    showLogin('', true);
    cloud.anmelden(qr).then((r) => (r.ok ? play(r) : fail(r)), () => fail({ grund: cloud.TEXT.sonst }));
    return;
  }
  const remembered = S.code();
  showLogin(spur ? t('login.partial') : '', Boolean(remembered));
  cloud.start().then((r) => {
    if (r.ok) { play(r); return null; }
    if (r.grund) { fail(r); return null; }
    // Firebase kennt niemanden, der Tab aber schon: mit dem gemerkten Code anmelden
    return remembered && S.code() === remembered ? cloud.anmelden(remembered) : null;
  }).then((r) => {
    if (!r) { if (!playing) login.ready(spur ? t('login.partial') : ''); return; }
    if (r.ok) play(r); else fail(r);
  }, () => { if (!playing) login.ready(); });
}

boot();
