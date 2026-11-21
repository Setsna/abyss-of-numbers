// Einstieg: Konfiguration und Bildliste laden, prüfen, Spielstand laden, dann Titel oder (nur lokal) Testkämpfe.
// Testkampf: index.html?dev=combat&enemies=crab,jelly&seed=1  (dazu &zeit=plus50|plus100|noTimer, &calm=1, &stufe=2, &stroemung=1.2, &area=caves, &klasse=4,
//   &rettung=1&leben=1 für die Rettungsaufgabe)
// Ohne ?dev=…: Spielablauf über Station und Seekarte.
// Etappe 10 (D37): Vor dem Spiel meldet sich das Kind mit seinem Code an (platform/account.js); der Spielstand
// liegt dann im Konto und wird mit Firebase abgeglichen. Auf localhost ohne Firebase-Attrappe läuft das Spiel
// wie bisher ohne Anmeldung nur im Browser (für Testkämpfe, Klick-Testspieler und Audit-Werkzeuge).
import { loadConfig, browserFetchJson } from './platform/config-loader.js?v=6737eab0';
import { createStorage, loadVerdict, STORAGE_KEY } from './platform/storage.js?v=6737eab0';
import { createAccount, accountBackend } from './platform/account.js?v=6737eab0';
import { FIREBASE } from './platform/firebase-config.js?v=6737eab0';
import { createAudio } from './platform/audio.js?v=6737eab0';
import { validateConfig } from './engine/config/validate.js?v=6737eab0';
import { createSave } from './engine/save/save.js?v=6737eab0';
import { createGame } from './engine/game.js?v=6737eab0';
import { setTexts, t } from './ui/text.js?v=6737eab0';
import { setManifest } from './ui/assets.js?v=6737eab0';
import { isLocalHost } from './ui/app.js?v=6737eab0';
import { mountCombat } from './ui/screens/combat.js?v=6737eab0';
import { mountReward } from './ui/screens/reward.js?v=6737eab0';
import { mountShop } from './ui/screens/shop.js?v=6737eab0';
import { mountEvent } from './ui/screens/event.js?v=6737eab0';
import { mountRiddle } from './ui/screens/riddle.js?v=6737eab0';
import { mountMap, mountAreaCleared } from './ui/screens/map.js?v=6737eab0';
import { mountBase } from './ui/screens/base.js?v=6737eab0';
import { mountTitle } from './ui/screens/title.js?v=6737eab0';
import { mountLogin, mountClosed } from './ui/screens/login.js?v=6737eab0';
import { mountStop } from './ui/screens/stop.js?v=6737eab0';
import { mountGrade } from './ui/screens/grade.js?v=6737eab0';
import { mountHeroCreate } from './ui/screens/hero-create.js?v=6737eab0';
import { mountLogbook } from './ui/screens/logbook.js?v=6737eab0';
import { mountAdult } from './ui/screens/adult.js?v=6737eab0';
import { createRng } from './engine/rng.js?v=6737eab0';

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
    loadTrack: (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); }), // Musikstücke (D35)
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
    game.setNow(Date.now(), new Date().getTimezoneOffset());
    // &area=caves usw. wählt auch die Aufgaben des Gebiets (Phase 6b, Gebietsfenster)
    const area = config.class3.areas[params.get('area')] ? params.get('area') : 'reef';
    const elite = config.elites.rules[params.get('elite')] ? params.get('elite') : null; // &elite=guard|regen|rage (Phase 9)
    // &rettung=1&leben=1 (Phase 10): Rettungsaufgabe im Testkampf ansehen, Held mit wenig Leben
    const rescue = params.get('rettung') === '1';
    const hp = Number(params.get('leben')) > 0 ? Number(params.get('leben')) : undefined;
    game.startCombat(enemies.length ? enemies : ['crab'], level, { enemyPower: Number(params.get('stroemung') || 1), areaId: area, elite, rescue, hp });
    show(mountCombat(app, {
      config, t, game, audio,
      onWon: () => {
        const { reward } = game.view();
        show(mountReward(app, {
          config, t, reward, levels: game.view().cardLevels,
          onPick: (cardId) => {
            game.setNow(Date.now(), new Date().getTimezoneOffset());
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
  // Update-Sicherheit (20.11.2026): Stammt der Stand aus einer neueren Fassung oder lässt er sich im Konto nicht lesen,
  // beginnt kein neues Spiel – ein neuer Held würde den echten Stand im Konto überschreiben. Nichts wird geschrieben.
  const verdict = loadVerdict(status, Boolean(session));
  if (verdict !== 'play') {
    mountStop(app, {
      t, kind: verdict === 'reload' ? 'newer' : 'corrupt',
      onReload: () => location.reload(),
      onLogout: session?.title?.onLogout ?? null,
    });
    return;
  }
  if (status === 'unavailable') showNotice(t('save.unavailable'));
  const game = createGame({ config, save, seed: Date.now() % 1000000007 });
  const audio = setupAudio(config, save?.einstellung);

  // Vor dem Anlegen des Helden gibt es keinen Stand (toSave liefert null), dann wird nichts geschrieben.
  const persist = () => {
    const out = game.toSave(Date.now());
    if (out && !storage.write(out)) showNotice(t('save.unavailable'));
  };
  const act = (command) => { game.setNow(Date.now(), new Date().getTimezoneOffset()); const events = game.dispatch(command); persist(); audio.events(events); return events; };

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
  let stationBought = null; // eben gekauftes Stück der Station, nur für die nächste Anzeige
  const takeBought = () => { const id = stationBought; stationBought = null; return id; };

  // Für Erwachsene: vom Titel und seit dem Handytest (21.11.2026) auch aus der Station; zurück geht es dorthin,
  // wo der Knopf war (der Bildschirm im Spiel bleibt derselbe)
  const openAdult = () => show(mountAdult(app, {
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
  }));

  function route() {
    const v = game.view();
    // Hintergrundklang: im Bosskampf das Boss-Stück, im Tauchgang das Gebiet, sonst die Station
    const bossFight = v.screen === 'combat' && v.combat?.enemies.some((e) => config.bosses.bosses[e.typeId]);
    audio.setScene(bossFight ? 'boss' : v.run?.areaId ?? v.cleared?.areaId ?? 'base');
    if (v.screen === 'title') {
      show(mountTitle(app, {
        t, hasSave: Boolean(v.profile),
        account: session?.title ?? null,
        onStart: () => { act({ type: 'start' }); route(); },
        onAdult: openAdult,
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
        onEditHero: () => { act({ type: 'editHero' }); route(); },
      }));
    } else if (v.screen === 'heroEdit') {
      // Held ändern (18.11.2026): dieselbe Heldenwahl, jetzige Figur und Name vorausgewählt
      show(mountHeroCreate(app, {
        t, config, initial: v.profile.held, areaId: v.run?.areaId ?? null,
        onDone: (hero) => { act({ type: 'changeHero', ...hero }); route(); },
        onCancel: () => { act({ type: 'cancelHeroEdit' }); route(); },
      }));
    } else if (v.screen === 'base') {
      show(mountBase(app, {
        t, config, game,
        onDive: (areaId, { abandon = false, depth } = {}) => { act(depth === undefined ? { type: 'dive', areaId, abandon } : { type: 'dive', areaId, abandon, depth }); route(); },
        onLogbook: (page) => { act({ type: 'openLogbook', page }); route(); },
        onAckNewCards: () => act({ type: 'ackNewCards' }), // Phase 9
        onAckMission: () => act({ type: 'ackMission' }), // Tagesauftrag geschafft gesehen (Phase 10)
        // Station ausbauen (Etappe 8): nach dem Kauf steht das Stück im Bild, oben ein Satz dazu
        onBuy: (upgradeId) => {
          const ok = act({ type: 'buyUpgrade', upgradeId }).some((e) => e.type === 'upgradeBought');
          stationBought = ok ? upgradeId : null;
          route();
        },
        bought: takeBought(),
        account: session?.title ?? null,
        onAdult: openAdult,
      }));
    } else if (v.screen === 'map') {
      show(mountMap(app, {
        t, config, game,
        onExplain: (key) => act({ type: 'markExplained', key }),
        onBeforeEnter: () => game.setNow(Date.now(), new Date().getTimezoneOffset()),
        onEnter: (events, { stay }) => {
          game.setNow(Date.now(), new Date().getTimezoneOffset());
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
        onPersist: () => { game.setNow(Date.now(), new Date().getTimezoneOffset()); persist(); }, // Rettung, Zweite Luft (Phase 10)
        onWon: () => {
          persist(); // Raum erledigt, Erfahrung und Perlen sind schon verbucht
          show(mountReward(app, {
            config, t, reward: game.view().reward, levels: game.view().cardLevels, areaId: game.view().run?.areaId ?? game.view().cleared?.areaId,
            onPick: (cardId) => {
              game.setNow(Date.now(), new Date().getTimezoneOffset());
              game.dispatch({ type: 'pickReward', cardId });
              persist();
              route();
            },
          }));
        },
        // Uhr vor der Rückkehr zur Station: nach Mitternacht gilt der Auftrag des neuen Tages (Abschlussreview Etappe 5)
        onLost: () => { game.setNow(Date.now(), new Date().getTimezoneOffset()); persist(); route(); },
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
    } else if (v.screen === 'event') {
      // Ereignisraum (Phase 9, Etappe 2)
      show(mountEvent(app, {
        t, game,
        onChoose: (optionId) => { act({ type: 'chooseEventOption', optionId }); route(); },
      }));
    } else if (v.screen === 'riddle') {
      // Rätselraum im Tempel (Phase 9, Etappe 7)
      show(mountRiddle(app, {
        t, game,
        onAnswer: (choiceIndex) => {
          const events = act({ type: 'answerRiddle', choiceIndex });
          if (events.some((e) => e.type === 'riddleSolved')) route();
          return events;
        },
        onLeave: () => { act({ type: 'leaveRiddle' }); route(); },
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
    clearTimeout(slowTimer);
    playing = true;
    try { startPlay(r); } catch (e) {
      // Fehlersuche (19.11.2026): Ein Fehler beim Start darf nicht unsichtbar im „Einen Moment …“ hängen bleiben.
      playing = false;
      showLogin(t('login.crash', { msg: String(e?.message ?? e).slice(0, 160) }));
    }
  }

  function startPlay(r) {
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
    clearTimeout(slowTimer);
    // Die Lehrkraft hat Abyss of Numbers gesperrt (oeffentlich/plattformen): „Bald offen“ statt Code-Eingabe
    if (r.zu) { showClosed(); return; }
    // Die Lehrkraft hat den Code gesperrt: nicht auf dem Gerät weiterspielen lassen
    if (r.grund === cloud.TEXT.gesperrt && S.aktiv()) S.abmelden();
    if (login) login.fail(r.grund || cloud.TEXT.sonst);
    else showLogin(r.grund || cloud.TEXT.sonst);
  }

  // Dauert die Anmeldung länger als 15 Sekunden, sagt die Seite, an welcher Stelle sie steht (Fehlersuche Schul-iPad,
  // 19.11.2026). Kommt die Antwort doch noch, geht das Spiel trotzdem los.
  let slowTimer = null;
  let lastError = '';
  window.addEventListener('error', (e) => { lastError = String(e.message ?? '').slice(0, 120); });
  window.addEventListener('unhandledrejection', (e) => { lastError = String(e.reason?.message ?? e.reason ?? '').slice(0, 120); });
  const watch = () => {
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => {
      if (!playing && login) login.fail(t('login.slow', { step: `${cloud.schritt()}, Firebase ${typeof firebase === 'undefined' ? 'fehlt' : 'da'}${lastError ? `, Fehler: ${lastError}` : ''}` }));
    }, 15000);
  };

  // „Bald offen“ (Plattform-Freigabe, 21.11.2026). Das Kind ist schon abgemeldet; „Abmelden“ führt zur Code-Eingabe.
  function showClosed() {
    login = null;
    mountClosed(app, { t, text: cloud.TEXT.zu, onLogout: () => { cloud.abmelden().then(() => showLogin(), () => showLogin()); } });
  }

  function showLogin(hint = '', busy = false) {
    login = mountLogin(app, {
      t, hint, busy,
      onSubmit: (code) => { watch(); return cloud.anmelden(code).then((r) => (r.ok ? play(r) : fail(r)), (e) => fail({ grund: `${cloud.TEXT.sonst} (${String(e?.message ?? e).slice(0, 120)})` })); },
    });
    if (busy) watch();
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

// Zweite Absicherung gegen den Doppeltipp-Zoom (Ingo, 19.11.2026: Kinder tippen schnell zweimal auf dieselbe
// Stelle, Safari zoomt hinein). Ein zweiter Tipp innerhalb von 350 ms an fast derselben Stelle löst keinen Zoom
// aus. Knöpfe, Karten und Eingabefelder bleiben unberührt (dort reicht touch-action aus base.css), damit schnelles
// Tippen auf der Zahlentastatur (33, 100) jede Ziffer zählt.
let lastTap = { t: 0, x: 0, y: 0 };
document.addEventListener('touchend', (e) => {
  if (e.touches.length > 0 || e.changedTouches.length !== 1) return;
  const p = e.changedTouches[0];
  const now = e.timeStamp;
  const near = Math.abs(p.clientX - lastTap.x) < 40 && Math.abs(p.clientY - lastTap.y) < 40;
  if (now - lastTap.t < 350 && near && !e.target.closest?.('button, a, input, textarea, select, label, [role=button], [tabindex], .card')) e.preventDefault();
  lastTap = { t: now, x: p.clientX, y: p.clientY };
}, { passive: false });

boot();
