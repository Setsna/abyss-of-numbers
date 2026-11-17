// Eigene Symbole im Comic-Strich: Tuschekontur, flache Füllung (aus dem Prototyp, Phase 3).
const S = 'stroke="#14161f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';

export const ICON = {
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ff5a4e" d="M12 20.5s-7.5-4.6-8.9-9.4C2.2 7.9 4.4 5 7.4 5c1.9 0 3.4 1.1 4.6 2.7C13.2 6.1 14.7 5 16.6 5c3 0 5.2 2.9 4.3 6.1-1.4 4.8-8.9 9.4-8.9 9.4z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#8fd3ff" d="M12 2.8l7.6 2.8v5.6c0 5-3.3 8.6-7.6 10.1-4.3-1.5-7.6-5.1-7.6-10.1V5.6z"/><path ${S} fill="none" d="M12 6v12"/></svg>`,
  attack: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#fbfbf7" d="M4 20l3-1 11-11 1-4-4 1L4 16z"/><path ${S} fill="#ffd23f" d="M3 17.5l3.5 3.5 1.6-1.6-3.5-3.5z"/></svg>`,
  bolt: `<svg viewBox="0 0 24 34" aria-hidden="true"><path ${S} fill="#ffd23f" d="M14.5 1.5L3 19h7.5l-2.5 13.5L21 13h-7.8z"/></svg>`,
  deck: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect ${S} fill="#1d7fb8" x="7" y="3" width="12" height="16" rx="2"/><rect ${S} fill="#fbfbf7" x="4" y="6" width="12" height="16" rx="2"/></svg>`,
  discard: `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-12 11 13)"><rect ${S} fill="#fbfbf7" x="5" y="5" width="12" height="16" rx="2"/><path ${S} fill="none" d="M8 10l6 6M14 10l-6 6"/></g></svg>`,
  heal: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#3fbf7f" d="M12 21c-4-3-6-7-5-11 1-3 4-6 5-7 1 1 4 4 5 7 1 4-1 8-5 11z"/><path ${S} fill="none" d="M12 8v10"/></svg>`,
  swirl: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="#fbfbf7" stroke-linecap="round" stroke-width="2.6" d="M12.5 12.2a1.6 1.6 0 1 1-1.9-1.6 3.4 3.4 0 1 1-2.2 4.9 5.4 5.4 0 1 1 9.6-4.2 7.2 7.2 0 0 1-3 7.2"/></svg>`,
  pearl: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle ${S} fill="#fbfbf7" cx="12" cy="12" r="8"/><path fill="none" stroke="#8fd3ff" stroke-width="2.4" stroke-linecap="round" d="M8.6 10.2a3.6 3.6 0 0 1 3.2-2.4"/></svg>`,
  rest: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#3fbf7f" d="M12 21c-1-4-1-8 0-12M12 13c-3-1-6-4-6-8 3 0 6 2 6 5M12 11c2-2 5-3 7-2-1 3-4 4-7 4"/><path ${S} fill="#fbfbf7" d="M5 21h14"/></svg>`,
  boss: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ff5a4e" d="M5 12a7 7 0 0 1 14 0v2c0 1.5-1 2.5-2 3l1 3.5-2.5-1.5-1 2.5-1.5-2.5-1.5 2.5-1-2.5L8 20.5 9 17c-1-.5-2-1.5-2-3z"/><circle ${S} fill="#fbfbf7" cx="9.5" cy="11" r="1.6"/><circle ${S} fill="#fbfbf7" cx="14.5" cy="11" r="1.6"/></svg>`,
  treasure: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ffd23f" d="M3.5 11h17v8.5h-17z"/><path ${S} fill="#c9893a" d="M3.5 11c0-3.6 2.4-6 5-6h7c2.6 0 5 2.4 5 6z"/><rect ${S} fill="#fbfbf7" x="10.2" y="9.5" width="3.6" height="4.5" rx="1"/></svg>`,
  shop: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#fbfbf7" d="M4 9h16v11H4z"/><path ${S} fill="#ff5a4e" d="M3 9l2-5h14l2 5c0 1.4-1.1 2.3-2.4 2.3S16.2 10.4 16.2 9c0 1.4-1.1 2.3-2.4 2.3S11.4 10.4 11.4 9c0 1.4-1.1 2.3-2.4 2.3S6.6 10.4 6.6 9c0 1.4-1.1 2.3-2.4 2.3S3 10.4 3 9z"/><circle ${S} fill="#fbfbf7" cx="12" cy="16" r="2.4"/></svg>`,
  harpoon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="none" stroke-width="2.6" d="M3 21L17 7"/><path ${S} fill="#fbfbf7" d="M14.5 4.5L21 3l-1.5 6.5-2.2-2.3z"/><path ${S} fill="none" d="M5 15l4 4"/></svg>`,
  conch: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ffd9b8" d="M4 18c2-8 7-13 15-14-1 3-2 6-1 9-3-1-6 0-8 3l-1 4z"/><path ${S} fill="none" d="M9 20c1-3 4-6 9-7M7 14c3-1 6-1 9 0"/></svg>`,
  crack: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#8fd3ff" d="M12 2.8l7.6 2.8v5.6c0 5-3.3 8.6-7.6 10.1-4.3-1.5-7.6-5.1-7.6-10.1V5.6z"/><path ${S} fill="none" stroke-width="2.6" d="M12 3.5l-2 5 3.5 2.5-2.5 5 1 4.5"/></svg>`,
  wall: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect ${S} fill="#ff9e7a" x="8" y="3" width="8" height="5" rx="1"/><rect ${S} fill="#ff9e7a" x="4" y="9.5" width="8" height="5" rx="1"/><rect ${S} fill="#ff9e7a" x="12" y="9.5" width="8" height="5" rx="1"/><rect ${S} fill="#fbfbf7" x="1.5" y="16" width="7" height="5" rx="1"/><rect ${S} fill="#fbfbf7" x="8.5" y="16" width="7" height="5" rx="1"/><rect ${S} fill="#fbfbf7" x="15.5" y="16" width="7" height="5" rx="1"/></svg>`,
  bubbles: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle ${S} fill="#8fd3ff" cx="6" cy="17" r="3.6"/><circle ${S} fill="#8fd3ff" cx="12.5" cy="11.5" r="3.2"/><circle ${S} fill="#8fd3ff" cx="18" cy="5.5" r="2.8"/><path fill="none" stroke="#14161f" stroke-width="2" stroke-linecap="round" d="M8.6 14.6l1.4-1.2M14.8 9.3l1.2-1.4"/></svg>`,
  ink: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#3b2a5c" d="M5 17c-2.2 0-3-2.6-1.4-4 -.6-2.6 2-4.6 4.3-3.4C8.6 6.6 12.6 5.8 14.6 8c2.4-.8 4.8 1 4.4 3.4 2 .6 2.4 3.6.2 4.6-.8 2.4-4 2.6-5.2 1-1.4 1.6-4.2 1.4-5.2-.2C7.6 17.6 6 17.8 5 17z"/><circle fill="#fbfbf7" cx="10" cy="12.5" r="1.3"/><circle fill="#fbfbf7" cx="14" cy="12.5" r="1.3"/></svg>`,
  dice: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect ${S} fill="#fbfbf7" x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle fill="#14161f" cx="8.5" cy="8.5" r="1.7"/><circle fill="#14161f" cx="15.5" cy="15.5" r="1.7"/><circle fill="#14161f" cx="12" cy="12" r="1.7"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ffd23f" d="M4 5.5c3-1.5 5.5-1.5 8 0v14c-2.5-1.5-5-1.5-8 0z"/><path ${S} fill="#fbfbf7" d="M12 5.5c2.5-1.5 5-1.5 8 0v14c-3-1.5-5.5-1.5-8 0z"/></svg>`,
  next: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle ${S} fill="#ffd23f" cx="12" cy="12" r="9"/><path ${S} fill="none" stroke-width="2.8" d="M8 12h8M13 8.5l3.5 3.5-3.5 3.5"/></svg>`,
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ffd23f" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>`,
  helmet: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ffd23f" d="M4.5 13.5a7.5 7.5 0 0 1 15 0V18a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/><circle ${S} fill="#8fd3ff" cx="12" cy="13" r="4.2"/><path ${S} fill="none" d="M12 8.8v8.4M7.8 13h8.4"/><path ${S} fill="#fbfbf7" d="M3 20h18v1.8H3z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle ${S} fill="#fbfbf7" cx="12" cy="12" r="9"/><path ${S} fill="none" stroke-width="3" d="M7.5 12.5l3 3 6-6.5"/></svg>`,
  cross: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle ${S} fill="#fbfbf7" cx="12" cy="12" r="9"/><path ${S} fill="none" stroke-width="3" d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>`,
};

// Rechenzeichen als große Kartengrafik (gezeichnet, damit sie überall gleich aussehen).
export const OP_ICON_RAW = {
  add: `<svg viewBox="0 0 48 48" aria-hidden="true"><path ${S} stroke-width="3" fill="#fbfbf7" d="M19 6h10v13h13v10H29v13H19V29H6V19h13z"/></svg>`,
  sub: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect ${S} stroke-width="3" fill="#fbfbf7" x="6" y="19" width="36" height="10" rx="2"/></svg>`,
  mul: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle ${S} stroke-width="3" fill="#fbfbf7" cx="24" cy="24" r="11"/></svg>`,
  div: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle ${S} stroke-width="3" fill="#fbfbf7" cx="24" cy="13" r="6.5"/><circle ${S} stroke-width="3" fill="#fbfbf7" cx="24" cy="35" r="6.5"/></svg>`,
};

export const OP_ICON = OP_ICON_RAW; // Papierweiß mit Tuschekontur; Gelb bleibt Bonus und Auswahl vorbehalten
