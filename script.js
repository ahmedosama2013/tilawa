'use strict';

/* =========================================================
   Tilawa: Quran reader and player
   Data:  https://alquran.cloud/api  (text, translations, audio URLs)
   Audio: cdn.islamic.network (AlQuran Cloud editions) and everyayah.com (per-ayah folders)
   ========================================================= */

const API = 'https://api.alquran.cloud/v1';
const AUDIO_CDN = 'https://cdn.islamic.network/quran/audio';
const EVERYAYAH = 'https://everyayah.com/data';

// Reciters with a `folder` are served per ayah by EveryAyah (files named SSSAAA.mp3);
// the rest are AlQuran Cloud audio editions.
const RECITERS = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy', short: 'Alafasy', bitrate: 128 },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary', short: 'Al-Husary', bitrate: 128 },
  { id: 'ar.abdulbasitmurattal', name: 'Abdul Basit Abdus-Samad', short: 'Abdul Basit', bitrate: 192 },
  { id: 'ed.dosari', name: 'Yasser Al-Dosari', short: 'Al-Dosari', folder: 'Yasser_Ad-Dussary_128kbps' },
  { id: 'ed.sudais', name: 'Abdul Rahman Al-Sudais', short: 'Al-Sudais', folder: 'Abdurrahmaan_As-Sudais_192kbps' }
];

const TRANSLATIONS = {
  'en.sahih': { dir: 'ltr', lang: 'en', cls: '' },
  'ur.jalandhry': { dir: 'rtl', lang: 'ur', cls: '' },
  'en.transliteration': { dir: 'ltr', lang: 'en', cls: 'translit' },
  'off': null
};

const TRANSLATION_OPTIONS = [
  { value: 'en.sahih', label: 'English (Sahih International)', short: 'English' },
  { value: 'ur.jalandhry', label: 'Urdu (Jalandhry)', short: 'Urdu' },
  { value: 'en.transliteration', label: 'Transliteration', short: 'Transliteration' },
  { value: 'off', label: 'Arabic only', short: 'Arabic only' }
];

const SPEEDS = [0.75, 1, 1.25, 1.5];

const BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
const BISMILLAH_WORDS = 4;

const svgIcon = (inner, fill = 'none') =>
  `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const BOOKMARK_PATH = '<path d="M6.5 4h11a.5.5 0 0 1 .5.5V20l-6-4-6 4V4.5a.5.5 0 0 1 .5-.5z"/>';

const ICONS = {
  menu: svgIcon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: svgIcon('<path d="M6 6l12 12M18 6L6 18"/>'),
  play: svgIcon('<path d="M8 5.5v13l11-6.5z"/>'),
  pause: svgIcon('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  prev: svgIcon('<path d="M18 5v14l-9-7z"/><path d="M6 5v14"/>'),
  next: svgIcon('<path d="M6 5v14l9-7z"/><path d="M18 5v14"/>'),
  bookmark: svgIcon(BOOKMARK_PATH),
  bookmarkOn: svgIcon(BOOKMARK_PATH, 'currentColor'),
  repeat: svgIcon('<path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/>'),
  chevron: svgIcon('<path d="M6 9l6 6 6-6"/>'),
  check: svgIcon('<path d="M5 12.5l4.5 4.5L19 7.5"/>')
};

/* ---------- Small helpers ---------- */

const $ = (id) => document.getElementById(id);
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('tilawa:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('tilawa:' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }
};

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // only used with the static ICONS above
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

/* ---------- Custom dropdown (listbox pattern, replaces native select) ---------- */

function createDropdown(root, { label, options, value, onChange }) {
  const uid = root.id;
  let current = options.some((o) => o.value === value) ? value : options[0].value;
  let active = 0;

  const labelEl = h('span', { class: 'dd-label' });
  const btn = h('button', {
    class: 'dd-btn', type: 'button', id: uid + '-btn',
    'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': uid + '-list'
  }, labelEl, h('span', { class: 'dd-chev', html: ICONS.chevron }));

  const list = h('ul', { class: 'dd-list', role: 'listbox', id: uid + '-list', tabindex: '-1', 'aria-label': label });
  const items = options.map((o, i) => h('li', {
    class: 'dd-opt', role: 'option', id: `${uid}-opt-${i}`, 'aria-selected': 'false'
  }, h('span', { text: o.label }), h('span', { class: 'dd-check', html: ICONS.check })));
  list.append(...items);
  root.append(btn, list);

  const isOpen = () => root.classList.contains('open');

  function render() {
    const opt = options.find((o) => o.value === current);
    labelEl.textContent = opt.short || opt.label;
    btn.setAttribute('aria-label', `${label}: ${opt.label}`);
    items.forEach((el, i) => el.setAttribute('aria-selected', String(options[i].value === current)));
  }

  function setActive(i) {
    active = clamp(i, 0, items.length - 1);
    items.forEach((el, j) => el.classList.toggle('is-active', j === active));
    list.setAttribute('aria-activedescendant', items[active].id);
    items[active].scrollIntoView({ block: 'nearest' });
  }

  function open() {
    if (isOpen()) return;
    root.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    requestAnimationFrame(() => list.focus({ preventScroll: true }));
  }

  function close(refocus) {
    if (!isOpen()) return;
    root.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    list.removeAttribute('aria-activedescendant');
    if (refocus) btn.focus();
  }

  function choose(i) {
    const next = options[i].value;
    const changed = next !== current;
    current = next;
    render();
    close(true);
    if (changed) onChange(current);
  }

  btn.addEventListener('click', () => (isOpen() ? close(false) : open()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
  });

  list.addEventListener('keydown', (e) => {
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    switch (e.key) {
      case 'ArrowDown': handled(); setActive(active + 1); break;
      case 'ArrowUp': handled(); setActive(active - 1); break;
      case 'Home': handled(); setActive(0); break;
      case 'End': handled(); setActive(items.length - 1); break;
      case 'Enter':
      case ' ': handled(); choose(active); break;
      case 'Escape': handled(); close(true); break;
      case 'Tab': close(false); break;
    }
  });
  items.forEach((el, i) => {
    el.addEventListener('mouseenter', () => setActive(i));
    el.addEventListener('click', () => choose(i));
  });

  document.addEventListener('pointerdown', (e) => { if (!root.contains(e.target)) close(false); });

  render();
  return { set(v) { if (options.some((o) => o.value === v)) { current = v; render(); } } };
}

const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const fmtTime = (s) => {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
};

/* ---------- State ---------- */

const state = {
  surahs: [],
  surahNum: null,
  surah: null,          // Arabic text payload for the open surah
  ayahs: [],            // Arabic ayahs
  tr: null,             // translation ayahs (or null)
  audioAyahs: [],       // ayahs from the current reciter edition
  index: 0,             // current ayah index (0-based)
  hasSrc: false,
  playing: false,
  autoplay: false,
  token: 0,
  reciter: store.get('reciter', RECITERS[0].id),
  translation: store.get('translation', 'en.sahih'),
  speed: store.get('speed', 1),
  repeat: false,
  fontSize: store.get('fontSize', 2.4),
  bookmarks: store.get('bookmarks', [])
};

if (!RECITERS.some((r) => r.id === state.reciter)) state.reciter = RECITERS[0].id;
if (!(state.translation in TRANSLATIONS)) state.translation = 'en.sahih';

const audio = new Audio();
audio.preload = 'auto';

// Warms the HTTP cache with the next ayah so ayah-to-ayah gaps stay short. Never played.
const warm = new Audio();
warm.preload = 'auto';
function prefetchNext() {
  const next = state.audioAyahs[state.index + 1];
  if (next) warm.src = audioUrl(next);
}

/* ---------- API ---------- */

const cache = new Map();
async function api(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(API + path);
  if (!res.ok) throw new Error('Request failed (' + res.status + ')');
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.status || 'The Quran API returned an error');
  cache.set(path, json.data);
  return json.data;
}

async function loadTranslation(n) {
  if (state.translation === 'off') return null;
  try {
    const data = await api(`/surah/${n}/${state.translation}`);
    return data.ayahs;
  } catch {
    toast('Translation could not be loaded. Showing Arabic only.');
    return null;
  }
}

const reciterById = (id) => RECITERS.find((r) => r.id === id) || RECITERS[0];
const pad3 = (n) => String(n).padStart(3, '0');
const cdnUrl = (a) => `${AUDIO_CDN}/${reciterById(state.reciter).bitrate}/${state.reciter}/${a.number}.mp3`;
const audioUrl = (a) => {
  const r = reciterById(state.reciter);
  return r.folder ? `${EVERYAYAH}/${r.folder}/${pad3(state.surahNum)}${pad3(a.numberInSurah)}.mp3` : (a.audio || cdnUrl(a));
};
const fallbackAudioUrl = (a) => (reciterById(state.reciter).folder ? audioUrl(a) : cdnUrl(a));

/* ---------- Toast ---------- */

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

/* ---------- Sidebar: surah list ---------- */

function renderSurahList(filter = '') {
  const list = $('surahList');
  const q = filter.trim().toLowerCase();
  const items = state.surahs.filter((s) =>
    !q ||
    String(s.number) === q ||
    s.englishName.toLowerCase().includes(q) ||
    s.englishNameTranslation.toLowerCase().includes(q) ||
    s.name.includes(filter.trim())
  );

  list.replaceChildren();
  if (!items.length) {
    list.append(h('li', { class: 'empty', text: 'No surah matches that search. Try a name like "Kahf" or a number from 1 to 114.' }));
    return;
  }
  for (const s of items) {
    const btn = h('button', {
      class: 'surah-btn', type: 'button', 'data-surah': s.number,
      'aria-current': s.number === state.surahNum ? 'true' : null,
      onclick: () => { closeDrawer(); goTo(s.number); }
    },
      h('span', { class: 'surah-num', text: s.number }),
      h('span', {},
        h('span', { class: 'surah-en', text: s.englishName }),
        h('span', { class: 'surah-meta', text: `${s.englishNameTranslation}, ${s.numberOfAyahs} ayahs` })
      ),
      h('span', { class: 'surah-ar', lang: 'ar', text: s.name.replace(/^سُورَةُ\s*/, '') })
    );
    list.append(h('li', {}, btn));
  }
}

function markActiveSurah() {
  document.querySelectorAll('.surah-btn[data-surah]').forEach((b) => {
    if (Number(b.dataset.surah) === state.surahNum) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
}

/* ---------- Sidebar: saved ayahs ---------- */

function renderSaved() {
  const list = $('savedList');
  list.replaceChildren();
  if (!state.bookmarks.length) {
    list.append(h('li', { class: 'empty', text: 'Nothing saved yet. Use the bookmark icon on an ayah to keep your place.' }));
    return;
  }
  for (const b of state.bookmarks) {
    list.append(h('li', { class: 'saved-item' },
      h('button', {
        class: 'surah-btn', type: 'button',
        onclick: () => { closeDrawer(); goTo(b.s, b.a); }
      },
        h('span', {},
          h('span', { class: 'surah-en', text: `${b.name} ${b.s}:${b.a}` }),
          h('span', { class: 'surah-meta', text: 'Open this ayah' })
        )
      ),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': `Remove ${b.name} ${b.s}:${b.a} from saved`,
        html: ICONS.close,
        onclick: () => toggleBookmark(b.s, b.a)
      })
    ));
  }
}

function isBookmarked(s, a) { return state.bookmarks.some((b) => b.s === s && b.a === a); }

function toggleBookmark(s, a) {
  const i = state.bookmarks.findIndex((b) => b.s === s && b.a === a);
  if (i >= 0) state.bookmarks.splice(i, 1);
  else {
    const info = state.surahs.find((x) => x.number === s);
    state.bookmarks.push({ s, a, name: info ? info.englishName : 'Surah' });
  }
  store.set('bookmarks', state.bookmarks);
  renderSaved();
  document.querySelectorAll('.ayah').forEach((el) => {
    const btn = el.querySelector('.bm-btn');
    if (!btn) return;
    const on = isBookmarked(state.surahNum, Number(el.dataset.ayah));
    btn.setAttribute('aria-pressed', on);
    btn.setAttribute('aria-label', on ? 'Remove bookmark' : 'Bookmark this ayah');
    btn.innerHTML = on ? ICONS.bookmarkOn : ICONS.bookmark;
  });
}

function selectTab(name) {
  const saved = name === 'saved';
  $('tabSurahs').setAttribute('aria-selected', !saved);
  $('tabSurahs').tabIndex = saved ? -1 : 0;
  $('tabSaved').setAttribute('aria-selected', saved);
  $('tabSaved').tabIndex = saved ? 0 : -1;
  $('panelSurahs').hidden = saved;
  $('panelSaved').hidden = !saved;
}

/* ---------- Drawer (mobile) ---------- */

function openDrawer() {
  document.body.classList.add('drawer-open');
  $('scrim').hidden = false;
  $('menuBtn').setAttribute('aria-expanded', 'true');
  $('menuBtn').setAttribute('aria-label', 'Close surah list');
  $('menuBtn').innerHTML = ICONS.close;
}
function closeDrawer() {
  document.body.classList.remove('drawer-open');
  $('scrim').hidden = true;
  $('menuBtn').setAttribute('aria-expanded', 'false');
  $('menuBtn').setAttribute('aria-label', 'Open surah list');
  $('menuBtn').innerHTML = ICONS.menu;
}

/* ---------- Routing ---------- */

const USE_PATHS = location.protocol !== 'file:';

function parseHash() {
  const m = /surah\/(\d{1,3})(?:\/(\d{1,3}))?\/?$/i.exec(location.pathname) ||
    /^#?(?:surah\/)?(\d{1,3})(?:[:\/](\d{1,3}))?$/.exec(location.hash);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 114) return null;
  return { surah: n, ayah: m[2] ? Number(m[2]) : null };
}

// /Tilawa/surah/108 on a server, #surah/108 when opened straight from disk.
function routeUrl(s, a) {
  const p = 'surah/' + s + (a ? '/' + a : '');
  return USE_PATHS ? new URL(p, document.baseURI).pathname : '#' + p;
}

function setUrl(s, a, replace) {
  try { history[replace ? 'replaceState' : 'pushState'](null, '', routeUrl(s, a)); } catch { /* keep current URL */ }
}

function goTo(surah, ayah = null) {
  const cur = parseHash();
  if (cur && cur.surah === surah && cur.ayah === ayah) {
    if (surah === state.surahNum) {
      if (ayah) scrollToAyah(ayah); else $('reader').scrollIntoView({ block: 'start' });
    }
    return;
  }
  setUrl(surah, ayah, false);
  openSurah(surah, { ayah });
}

window.addEventListener('popstate', () => {
  const route = parseHash();
  if (route) openSurah(route.surah, { ayah: route.ayah });
});

/* ---------- Reader ---------- */

function showLoading() {
  const reader = $('reader');
  reader.setAttribute('aria-busy', 'true');
  reader.replaceChildren(h('p', { class: 'status', text: 'Loading surah…' }));
}

function showError(err, retry) {
  const reader = $('reader');
  reader.setAttribute('aria-busy', 'false');
  reader.replaceChildren(
    h('div', { class: 'status error' },
      h('p', { text: 'The surah could not be loaded. Check your connection and try again.' }),
      h('p', { text: String(err && err.message ? err.message : err), style: 'font-size:.85rem;color:var(--muted)' }),
      h('button', { type: 'button', text: 'Try again', onclick: retry })
    )
  );
}

async function openSurah(n, { ayah = null } = {}) {
  const token = ++state.token;
  const same = n === state.surahNum && state.surah;

  if (!same) {
    stopAudio();
    state.surahNum = n;
    store.set('last', n);
    showLoading();
  }
  markActiveSurah();

  try {
    const viaEveryAyah = Boolean(reciterById(state.reciter).folder);
    const [text, tr, audioData] = await Promise.all([
      api(`/surah/${n}/quran-uthmani`),
      loadTranslation(n),
      viaEveryAyah ? null : api(`/surah/${n}/${state.reciter}`)
    ]);
    if (token !== state.token) return;

    state.surah = text;
    state.ayahs = text.ayahs;
    state.tr = tr;
    state.audioAyahs = audioData ? audioData.ayahs : text.ayahs;

    renderReader();
    document.title = `${text.englishName} | Tilawa`;
    $('reader').setAttribute('aria-busy', 'false');
    updateNow();

    if (ayah) {
      state.index = clamp(ayah - 1, 0, state.ayahs.length - 1);
      requestAnimationFrame(() => scrollToAyah(ayah));
      updateNow();
    } else if (!same) {
      window.scrollTo({ top: 0 });
    }

    if (state.autoplay) {
      state.autoplay = false;
      playIndex(0);
    }
  } catch (err) {
    if (token !== state.token) return;
    showError(err, () => { state.surah = null; openSurah(n, { ayah }); });
  }
}

function renderReader() {
  const s = state.surah;
  const reader = $('reader');
  reader.replaceChildren();

  reader.append(
    h('header', { class: 'surah-head' },
      h('h1', { class: 'surah-title', lang: 'ar', dir: 'rtl', text: s.name }),
      h('p', { class: 'surah-name', text: s.englishName }),
      h('p', { class: 'surah-sub', text: s.englishNameTranslation }),
      h('ul', { class: 'facts' },
        h('li', { text: `Surah ${s.number}` }),
        h('li', { text: `${s.revelationType} revelation` }),
        h('li', { text: `${s.numberOfAyahs} ayahs` })
      )
    )
  );

  if (s.number !== 1 && s.number !== 9) {
    reader.append(h('p', { class: 'bismillah', lang: 'ar', dir: 'rtl', text: BISMILLAH }));
  }

  const wrap = h('div', { id: 'ayahs' });
  reader.append(wrap);
  renderAyahs();

  const nav = h('nav', { class: 'surah-nav', 'aria-label': 'Surah navigation' });
  const prev = state.surahs.find((x) => x.number === s.number - 1);
  const next = state.surahs.find((x) => x.number === s.number + 1);
  if (prev) nav.append(h('button', { type: 'button', onclick: () => goTo(prev.number) }, h('small', { text: 'Previous surah' }), prev.englishName));
  if (next) nav.append(h('button', { type: 'button', class: 'next', onclick: () => goTo(next.number) }, h('small', { text: 'Next surah' }), next.englishName));
  reader.append(nav);
}

function renderAyahs() {
  const wrap = $('ayahs');
  if (!wrap) return;
  const s = state.surah;
  const tInfo = TRANSLATIONS[state.translation];
  wrap.replaceChildren();

  state.ayahs.forEach((a, i) => {
    let text = a.text;
    // The API prefixes the Bismillah to ayah 1 of most surahs; we show it separately above.
    if (i === 0 && s.number !== 1 && s.number !== 9) {
      text = text.split(' ').slice(BISMILLAH_WORDS).join(' ');
    }
    const n = a.numberInSurah;
    const on = isBookmarked(s.number, n);

    const el = h('article', { class: 'ayah', id: 'ayah-' + n, 'data-ayah': n },
      h('div', { class: 'ayah-tools' },
        h('span', { class: 'ayah-ref', text: `${s.number}:${n}` }),
        h('button', {
          class: 'icon-btn play-ayah', type: 'button', 'aria-label': `Play ayah ${n}`,
          html: ICONS.play, onclick: () => onAyahPlay(i)
        }),
        h('button', {
          class: 'icon-btn bm-btn', type: 'button', 'aria-pressed': String(on),
          'aria-label': on ? 'Remove bookmark' : 'Bookmark this ayah',
          html: on ? ICONS.bookmarkOn : ICONS.bookmark,
          onclick: () => toggleBookmark(s.number, n)
        })
      ),
      h('p', { class: 'ayah-ar', lang: 'ar', dir: 'rtl' },
        text + ' ',
        h('span', { class: 'ayah-end', text: '\u06DD' + toArabicDigits(n) })
      ),
      state.tr && tInfo && state.tr[i]
        ? h('p', { class: 'ayah-tr ' + tInfo.cls, lang: tInfo.lang, dir: tInfo.dir, text: state.tr[i].text })
        : null
    );
    wrap.append(el);
  });

  if (state.hasSrc) highlight(state.index, false);
}

function scrollToAyah(n) {
  const el = $('ayah-' + n);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

function highlight(i, scroll = true) {
  document.querySelectorAll('.ayah.is-playing').forEach((e) => e.classList.remove('is-playing'));
  const el = $('ayah-' + (i + 1));
  if (!el) return;
  el.classList.add('is-playing');
  if (scroll) el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  syncAyahButtons();
}

function syncAyahButtons() {
  document.querySelectorAll('.play-ayah').forEach((b) => {
    const idx = Number(b.closest('.ayah').dataset.ayah) - 1;
    const active = state.hasSrc && state.playing && idx === state.index;
    b.innerHTML = active ? ICONS.pause : ICONS.play;
    b.setAttribute('aria-label', (active ? 'Pause ayah ' : 'Play ayah ') + (idx + 1));
  });
}

/* ---------- Audio player ---------- */

function onAyahPlay(i) {
  if (state.hasSrc && state.index === i && state.playing) audio.pause();
  else if (state.hasSrc && state.index === i) audio.play().catch(onPlayError);
  else playIndex(i);
}

function playIndex(i) {
  if (!state.audioAyahs.length) return;
  state.index = clamp(i, 0, state.audioAyahs.length - 1);
  const a = state.audioAyahs[state.index];
  audio.src = audioUrl(a);
  audio.playbackRate = state.speed;
  state.hasSrc = true;
  audio.play().catch(onPlayError);
  updateNow();
  highlight(state.index);
  updateMediaSession();
  prefetchNext();
}

function onPlayError(err) {
  if (err && err.name === 'AbortError') return; // a newer play() superseded this one
  state.playing = false;
  syncPlayer();
  toast('Audio could not be played. Check your connection and try again.');
}

function stopAudio() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  state.hasSrc = false;
  state.playing = false;
  state.index = 0;
  syncPlayer();
  updateProgress();
}

function togglePlay() {
  if (!state.audioAyahs.length) return;
  if (!state.hasSrc) return playIndex(state.index);
  if (audio.paused) audio.play().catch(onPlayError);
  else audio.pause();
}

function step(delta) {
  if (!state.audioAyahs.length) return;
  const next = state.index + delta;
  if (next < 0 || next >= state.audioAyahs.length) return;
  if (state.hasSrc && state.playing) playIndex(next);
  else {
    state.index = next;
    playIndex(next);
  }
}

function updateNow() {
  const s = state.surah;
  if (!s) return;
  $('nowTitle').textContent = `${s.englishName}, ayah ${state.index + 1} of ${s.numberOfAyahs}`;
  $('nowSub').textContent = reciterById(state.reciter).name;
}

function syncPlayer() {
  const btn = $('playBtn');
  btn.innerHTML = state.playing ? ICONS.pause : ICONS.play;
  btn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  syncAyahButtons();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
}

function updateProgress() {
  const seek = $('seek');
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  seek.value = pct * 10;
  seek.style.setProperty('--pct', pct + '%');
  $('timeNow').textContent = fmtTime(audio.currentTime);
  $('timeTotal').textContent = fmtTime(audio.duration);
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !state.surah) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `${state.surah.englishName}, ayah ${state.index + 1}`,
    artist: reciterById(state.reciter).name,
    album: 'Tilawa'
  });
  navigator.mediaSession.setActionHandler('play', () => audio.play().catch(onPlayError));
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
  navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
}

audio.addEventListener('play', () => { state.playing = true; syncPlayer(); });
audio.addEventListener('pause', () => { state.playing = false; syncPlayer(); });
audio.addEventListener('waiting', () => $('player').classList.add('is-loading'));
audio.addEventListener('playing', () => $('player').classList.remove('is-loading'));
audio.addEventListener('canplay', () => $('player').classList.remove('is-loading'));
audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('loadedmetadata', updateProgress);

audio.addEventListener('error', () => {
  if (!state.hasSrc) return;
  const a = state.audioAyahs[state.index];
  // Retry once with the CDN path if the API-provided URL fails.
  if (a && audio.src !== fallbackAudioUrl(a) && !audio.dataset.retried) {
    audio.dataset.retried = '1';
    audio.src = fallbackAudioUrl(a);
    audio.play().catch(onPlayError);
    return;
  }
  delete audio.dataset.retried;
  state.playing = false;
  syncPlayer();
  toast('This recitation could not be loaded. Try another reciter.');
});
audio.addEventListener('loadstart', () => {
  if (audio.src === audioUrl(state.audioAyahs[state.index] || {})) delete audio.dataset.retried;
});

audio.addEventListener('ended', () => {
  if (state.repeat) return playIndex(state.index);
  if (state.index < state.audioAyahs.length - 1) return playIndex(state.index + 1);
  // End of surah: continue with the next one.
  if (state.surahNum < 114) {
    state.autoplay = true;
    goTo(state.surahNum + 1);
  } else {
    state.playing = false;
    syncPlayer();
  }
});

/* ---------- Player controls ---------- */

let reciterMenu;
function buildReciters() {
  reciterMenu = createDropdown($('reciters'), {
    label: 'Reciter',
    options: RECITERS.map((r) => ({ value: r.id, label: r.name, short: r.short })),
    value: state.reciter,
    onChange: changeReciter
  });
}

async function changeReciter(id) {
  if (id === state.reciter) return;
  const wasPlaying = state.playing;
  const previous = state.reciter;
  state.reciter = id;
  store.set('reciter', id);
  updateNow();
  if (!state.surahNum) return;
  try {
    state.audioAyahs = reciterById(id).folder ? state.ayahs : (await api(`/surah/${state.surahNum}/${id}`)).ayahs;
    if (wasPlaying) playIndex(state.index);
    else if (state.hasSrc) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      state.hasSrc = false;
      syncPlayer();
      updateProgress();
    }
    updateMediaSession();
  } catch (err) {
    state.reciter = previous;
    store.set('reciter', previous);
    reciterMenu.set(previous);
    updateNow();
    toast('Could not load that reciter. Try again in a moment.');
  }
}

function applyFontSize() {
  document.documentElement.style.setProperty('--ar-size', state.fontSize + 'rem');
  store.set('fontSize', state.fontSize);
}

function setupControls() {
  $('menuBtn').innerHTML = ICONS.menu;
  $('prevBtn').innerHTML = ICONS.prev;
  $('nextBtn').innerHTML = ICONS.next;
  $('playBtn').innerHTML = ICONS.play;
  $('repeatBtn').innerHTML = ICONS.repeat + '<span class="chip-label">Repeat</span>';

  $('menuBtn').addEventListener('click', () => {
    document.body.classList.contains('drawer-open') ? closeDrawer() : openDrawer();
  });
  $('scrim').addEventListener('click', closeDrawer);

  $('playBtn').addEventListener('click', togglePlay);
  $('prevBtn').addEventListener('click', () => step(-1));
  $('nextBtn').addEventListener('click', () => step(1));

  $('repeatBtn').addEventListener('click', () => {
    state.repeat = !state.repeat;
    $('repeatBtn').setAttribute('aria-pressed', state.repeat);
  });

  if (!SPEEDS.includes(state.speed)) state.speed = 1;
  audio.playbackRate = state.speed;
  createDropdown($('speedMenu'), {
    label: 'Playback speed',
    options: SPEEDS.map((v) => ({ value: String(v), label: v + 'x' })),
    value: String(state.speed),
    onChange: (v) => {
      state.speed = Number(v);
      audio.playbackRate = state.speed;
      store.set('speed', state.speed);
    }
  });

  $('seek').addEventListener('input', (e) => {
    if (!audio.duration) return;
    audio.currentTime = (Number(e.target.value) / 1000) * audio.duration;
  });

  createDropdown($('translationMenu'), {
    label: 'Translation',
    options: TRANSLATION_OPTIONS,
    value: state.translation,
    onChange: async (v) => {
      state.translation = v;
      store.set('translation', v);
      if (!state.surahNum || !state.surah) return;
      state.tr = await loadTranslation(state.surahNum);
      renderAyahs();
    }
  });

  $('fontUp').addEventListener('click', () => { state.fontSize = clamp(+(state.fontSize + 0.2).toFixed(1), 1.4, 4); applyFontSize(); });
  $('fontDown').addEventListener('click', () => { state.fontSize = clamp(+(state.fontSize - 0.2).toFixed(1), 1.4, 4); applyFontSize(); });

  $('tabSurahs').addEventListener('click', () => selectTab('surahs'));
  $('tabSaved').addEventListener('click', () => selectTab('saved'));

  const search = $('search');
  search.addEventListener('input', () => renderSurahList(search.value));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = document.querySelector('#surahList .surah-btn');
      if (first) first.click();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
    if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target;
      if (t.closest('input, select, textarea, button, a, [role="tab"], [role="listbox"]')) return;
      e.preventDefault();
      togglePlay();
    }
  });

  // Keep layout offsets in sync with the real player height.
  const player = $('player');
  const setH = () => document.documentElement.style.setProperty('--player-h', player.offsetHeight + 'px');
  setH();
  if ('ResizeObserver' in window) new ResizeObserver(setH).observe(player);
  window.addEventListener('resize', setH);

  // Desktop: drawer state should never stick when the layout changes.
  window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => { if (e.matches) closeDrawer(); });

  // With a <base> tag, plain #fragment links would reload the page, so handle these two in script.
  document.querySelector('.skip-link').addEventListener('click', (e) => { e.preventDefault(); $('reader').focus(); });
  document.querySelector('.brand').addEventListener('click', (e) => { e.preventDefault(); closeDrawer(); goTo(1); });

  applyFontSize();
  buildReciters();
  renderSaved();
  syncPlayer();
}

/* ---------- Welcome dialog ---------- */

function setupWelcome() {
  const dlg = $('welcome');
  if (typeof dlg.showModal !== 'function') return;
  const close = () => dlg.close();
  $('welcomeClose').addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => store.set('welcomed', true));
  $('aboutBtn').addEventListener('click', () => { closeDrawer(); dlg.showModal(); });
  if (!store.get('welcomed', false)) dlg.showModal();
}

/* ---------- Init ---------- */

async function init() {
  setupControls();
  setupWelcome();
  try {
    state.surahs = await api('/surah');
  } catch (err) {
    showError(err, init);
    return;
  }
  renderSurahList();

  const route = parseHash();
  const start = route ? route.surah : store.get('last', 1);
  const startNum = clamp(Number(start) || 1, 1, 114);
  setUrl(startNum, route ? route.ayah : null, true);
  openSurah(startNum, { ayah: route ? route.ayah : null });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();