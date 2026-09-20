'use strict';
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), audio = $('audio');
const FONT_WEB = '"Archivo Narrow"';
// Arial Narrow ada bawaan di macOS/Windows. HP nggak punya, jadi kebagian
// Archivo Narrow yang kita hosting sendiri (metriknya cuma beda 1.7%).
const FONT = `"Arial Narrow",${FONT_WEB},"Liberation Sans Narrow","Nimbus Sans Narrow","Helvetica Neue",Helvetica,Arial,sans-serif`;
const state = { tracks: [], lines: [], title: '', duration: 0, hasAudio: false, t: 0, t0: 0, playing: false, recording: false, tap: null, tapIdx: 0 };
// Safari iOS nggak punya ctx.filter sama sekali, dan ada browser yang punya
// propertinya tapi nggak ngefek — jadi diuji beneran, bukan cuma dicek ada.
const canFilter = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 40;
  const x = c.getContext('2d');
  if (!('filter' in x)) return false;
  x.fillStyle = '#fff'; x.fillRect(0, 0, 40, 40);
  x.filter = 'blur(4px)';
  x.fillStyle = '#000'; x.fillRect(15, 15, 10, 10);
  x.filter = 'none';
  const d = x.getImageData(0, 0, 40, 40).data;
  let abu = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 30 && d[i] < 225) abu++;
  return abu > 20;                    // ada piksel abu-abu = blur beneran jalan
})();
const PLACEHOLDER = 'semoga umur dengan rezeki sama panjang';

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const stamp = t => { t = Math.max(0, t); const m = Math.floor(t / 60); return `${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(2).padStart(5, '0')}`; };
const off = () => +$('offset').value || 0;
function say(msg, kind) { const el = $('status'); el.textContent = msg; el.className = kind || ''; }

/* ---------- parsing ---------- */
function parseLRC(text, duration) {
  const raw = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/\[(\d+):(\d+(?:[.:]\d+)?)\]\s?(.*)/);
    if (m) raw.push([+m[1] * 60 + parseFloat(m[2].replace(':', '.')), m[3].trim()]);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const out = [];
  raw.forEach(([s, t], i) => {
    const e = i + 1 < raw.length ? raw[i + 1][0] : (duration || s + 4);
    if (t && e > s) out.push({ s, e, t });
  });
  return out;
}

function setLines(lines, duration, title) {
  state.lines = lines;
  state.title = title || '';
  state.duration = state.hasAudio && audio.duration ? audio.duration : (duration || (lines.length ? lines[lines.length - 1].e : 0));
  $('seek').max = state.duration;
  ['seek', 'play', 'skip', 'tapStart', 'dlLrc', 'export'].forEach(id => $(id).disabled = false);
  layoutCache.clear();
  renderList();
  seek(0);
  simpanSesi();
}

/* ---------- lyric list ---------- */
let listItems = [], lastActive = -1;
function renderList(fokus) {
  const ol = $('lineList');
  const scroll = ol.scrollTop;
  ol.innerHTML = '';
  listItems = state.lines.map((l, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<button class="ts" title="Loncat ke sini"></button>` +
      `<input class="tx" spellcheck="false">` +
      `<span class="act">` +
      `<button data-act="pecah" title="Pecah di posisi kursor (Enter)">pecah</button>` +
      `<button data-act="gabung" title="Gabung sama baris bawah">gabung</button>` +
      `<button data-act="hapus" title="Hapus baris">hapus</button>` +
      `</span>`;
    const [ts, tx, act] = li.children;
    tx.value = l.t;
    ts.onclick = () => seek(Math.max(0, l.s - off()));
    tx.oninput = () => { l.t = tx.value; layoutCache.clear(); lastActive = -1; draw(now()); simpanSesi(); };
    tx.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); pecahBaris(i, tx.selectionStart); }
      else if (e.key === 'Escape') tx.blur();
    };
    act.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'pecah') pecahBaris(i, tx.selectionStart || Math.floor(tx.value.length / 2));
      else if (b.dataset.act === 'gabung') gabungBaris(i);
      else hapusBaris(i);
    };
    ol.appendChild(li);
    return li;
  });
  stampList();
  ol.scrollTop = scroll;
  $('lineCount').textContent = state.lines.length;
  $('lineEmpty').hidden = state.lines.length > 0;
  lastActive = -1;
  if (fokus != null && listItems[fokus]) {
    const tx = listItems[fokus].children[1];
    tx.focus(); tx.setSelectionRange(0, 0);
  }
}
function stampList() {
  state.lines.forEach((l, i) => { if (listItems[i]) listItems[i].children[0].textContent = stamp(l.s); });
}

/* ---------- edit baris ---------- */
function setelahUbah(fokus) {
  relink();
  layoutCache.clear(); lastActive = -1;
  renderList(fokus);
  draw(now()); simpanSesi();
}
function pecahBaris(i, pos) {
  const l = state.lines[i];
  const kiri = l.t.slice(0, pos).trim(), kanan = l.t.slice(pos).trim();
  if (!kiri || !kanan) { say('Taruh kursor di tengah teks dulu buat mecah baris.', 'err'); return; }
  // waktu mulai baris baru dibagi sesuai posisi potongnya
  const rasio = pos / Math.max(1, l.t.length);
  const tengah = l.s + (l.e - l.s) * rasio;
  l.t = kiri;
  state.lines.splice(i + 1, 0, { s: Math.min(Math.max(tengah, l.s + 0.05), l.e - 0.05), e: l.e, t: kanan });
  setelahUbah(i + 1);
  say(`Baris dipecah jadi 2 · total ${state.lines.length} baris`, 'ok');
}
function gabungBaris(i) {
  if (i + 1 >= state.lines.length) { say('Nggak ada baris di bawahnya.', 'err'); return; }
  const l = state.lines[i], n = state.lines[i + 1];
  l.t = `${l.t} ${n.t}`.trim();
  l.e = n.e;
  state.lines.splice(i + 1, 1);
  setelahUbah(i);
  say(`Digabung · total ${state.lines.length} baris`, 'ok');
}
function hapusBaris(i) {
  const l = state.lines[i];
  if (i > 0) state.lines[i - 1].e = l.e;      // baris sebelumnya ngisi bekasnya
  state.lines.splice(i, 1);
  setelahUbah(Math.min(i, state.lines.length - 1));
  say(`Baris dihapus · sisa ${state.lines.length} baris`, 'ok');
}
function highlight(i) {
  if (i === lastActive) return;
  if (listItems[lastActive]) listItems[lastActive].classList.remove('active');
  if (listItems[i]) {
    listItems[i].classList.add('active');
    listItems[i].scrollIntoView({ block: 'nearest' });
  }
  lastActive = i;
}

/* ---------- render ---------- */
const layoutCache = new Map();
function layout(text, w, h) {
  const maxf = +$('maxfont').value / 100 * Math.min(w, h);
  const key = `${text}|${w}|${h}|${maxf}`;
  if (layoutCache.has(key)) return layoutCache.get(key);
  const boxW = w * .86, boxH = h * .80;
  const wrap = fs => {
    ctx.font = `${fs}px ${FONT}`;
    const out = []; let cur = '';
    for (const word of text.split(/\s+/)) {
      const tr = cur ? cur + ' ' + word : word;
      if (cur && ctx.measureText(tr).width > boxW) { out.push(cur); cur = word; } else cur = tr;
    }
    if (cur) out.push(cur);
    return out;
  };
  let lo = 20, hi = Math.floor(Math.min(w, h) * .5), best = { fs: 20, lines: [text] };
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, lines = wrap(mid);
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    if (lines.length * mid * 1.05 <= boxH && widest <= boxW) { best = { fs: mid, lines }; lo = mid + 1; } else hi = mid - 1;
  }
  if (best.fs > maxf) best = { fs: Math.floor(maxf), lines: wrap(Math.floor(maxf)) };
  layoutCache.set(key, best);
  return best;
}

function currentLine(t) {
  if (state.tap) return state.tapIdx > state.tap.from ? state.tapIdx - 1 : -1;
  const tt = t + off();
  return state.lines.findIndex(l => tt >= l.s && tt < l.e);
}

function draw(t) {
  const w = cv.width, h = cv.height;
  ctx.filter = 'none'; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.fillStyle = $('bg').value;
  ctx.fillRect(0, 0, w, h);

  const i = currentLine(t);
  let text = i >= 0 ? state.lines[i].t : null;
  if (!text) {
    const beforeFirst = state.tap ? state.tapIdx === state.tap.from : (state.lines.length && t + off() < state.lines[0].s);
    if (state.lines.length && beforeFirst && state.title) text = state.title;
    else if (!state.lines.length) text = PLACEHOLDER;
  }
  highlight(state.lines.length ? i : -1);
  if (!text) return;

  const { fs, lines } = layout(text.toLowerCase(), w, h);
  const lh = fs * 1.05, y0 = $('valign').value === 'top' ? h * .08 : (h - lines.length * lh) / 2;
  const blur = +$('blur').value * fs / 100;
  ctx.font = `${fs}px ${FONT}`; ctx.textBaseline = 'top'; ctx.fillStyle = $('fg').value;
  const paint = dx => lines.forEach((l, k) => ctx.fillText(l, w * .07 + dx, y0 + k * lh));
  if (canFilter) { ctx.filter = `blur(${blur}px)`; paint(0); ctx.filter = 'none'; }
  else {
    // Tanpa ctx.filter: teksnya digambar jauh di luar kanvas, yang kelihatan
    // cuma bayangannya yang udah ke-blur. shadowBlur = 2x sigma-nya filter.
    // Cukup sekali paint — dua kali bikin alpha numpuk dan hurufnya jadi gemuk.
    ctx.shadowColor = $('fg').value;
    ctx.shadowBlur = blur * 2;
    ctx.shadowOffsetX = 20000;
    paint(-20000);
    ctx.shadowOffsetX = 0; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  }
}

/* ---------- playback ---------- */
const now = () => state.hasAudio ? audio.currentTime : state.t + (state.playing ? (performance.now() - state.t0) / 1000 : 0);
function seek(t) {
  t = Math.max(0, Math.min(t, state.duration || 0));
  state.t = t; state.t0 = performance.now();
  if (state.hasAudio) audio.currentTime = t;
  draw(t); ui(t);
}
function ui(t) { $('seek').value = t; $('time').textContent = `${fmt(t)} / ${fmt(state.duration)}`; }
function play() {
  if (!state.duration) return;
  if (state.hasAudio) audio.play().catch(err => say('Audio gagal diputar: ' + err.message, 'err'));
  else state.t0 = performance.now();
  state.playing = true; $('play').textContent = 'Pause';
}
function pause() {
  if (state.hasAudio) audio.pause(); else state.t = now();
  state.playing = false; $('play').textContent = 'Play';
}
function tick() {
  if (state.playing) {
    const t = now();
    if (t >= state.duration) { pause(); if (state.tap) finishTap(); else if (!state.recording) seek(0); }
    else { draw(t); ui(t); }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

$('play').onclick = () => state.playing ? pause() : play();
$('skip').onclick = () => state.lines.length && seek(Math.max(0, state.lines[0].s - off() - 1));
$('seek').oninput = e => seek(+e.target.value);
audio.onended = () => { if (state.recording) return; pause(); if (state.tap) finishTap(); else seek(0); };

/* ---------- inputs ---------- */
function useTrack(i) {
  const it = state.tracks[i];
  if (!it || !it.syncedLyrics) { say('Track ini nggak punya syncedLyrics.', 'err'); return; }
  setLines(parseLRC(it.syncedLyrics, it.duration), it.duration, it.trackName);
  say(`${it.trackName} — ${it.artistName} · ${state.lines.length} baris`, 'ok');
}

async function loadLyricFile(f) {
  if (!f) return;
  const text = await f.text();
  $('jsonName').textContent = f.name;
  $('jsonName').classList.add('filled');
  if (/^\s*[[{]/.test(text) && !/^\s*\[\d+:/.test(text)) {
    try {
      const d = JSON.parse(text);
      state.tracks = Array.isArray(d) ? d : [d];
      $('track').innerHTML = state.tracks
        .map((t, i) => `<option value="${i}">${(t.trackName || 'Untitled')} — ${(t.artistName || '?')}</option>`).join('');
      $('trackWrap').hidden = state.tracks.length < 1;
      useTrack(0);
      return;
    } catch (err) { say('JSON nggak valid: ' + err.message, 'err'); return; }
  }
  const lines = parseLRC(text, 0);
  if (!lines.length) { say('Format lirik nggak kebaca.', 'err'); return; }
  $('trackWrap').hidden = true;
  setLines(lines, 0, f.name.replace(/\.[^.]+$/, ''));
  say(`${f.name} · ${lines.length} baris`, 'ok');
}

function loadAudioFile(f) {
  if (!f) return;
  pause();
  audio.src = URL.createObjectURL(f);
  $('audioName').textContent = f.name;
  $('audioName').classList.add('filled');
  audio.onloadedmetadata = () => {
    state.hasAudio = true; state.duration = audio.duration;
    $('seek').max = audio.duration; $('seek').disabled = false; $('play').disabled = false;
    if (state.lines.length) $('export').disabled = false;
    seek(0);
    say(`Audio siap: ${f.name} (${fmt(audio.duration)})`, 'ok');
  };
  audio.onerror = () => say('Audio nggak bisa dibaca browser ini.', 'err');
}

$('jsonFile').onchange = e => loadLyricFile(e.target.files[0]);
$('audioFile').onchange = e => loadAudioFile(e.target.files[0]);
$('track').onchange = e => useTrack(+e.target.value);
$('lrcBtn').onclick = () => {
  const lines = parseLRC($('lrc').value, 0);
  if (!lines.length) { say('Format LRC nggak kebaca. Contoh: [00:12.30] teks', 'err'); return; }
  $('trackWrap').hidden = true;
  setLines(lines, 0, '');
  say(`LRC ditempel · ${lines.length} baris`, 'ok');
};

/* drag & drop */
[['dropJson', loadLyricFile], ['dropAudio', loadAudioFile]].forEach(([id, fn]) => {
  const el = $(id);
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); fn(e.dataTransfer.files[0]); });
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

/* look & timing controls */
$('size').onchange = () => {
  const [w, h] = $('size').value.split('x');
  cv.width = +w; cv.height = +h; layoutCache.clear(); draw(now());
};
$('swatches').onclick = e => {
  const b = e.target.closest('.sw'); if (!b) return;
  $('bg').value = b.dataset.bg; $('fg').value = b.dataset.fg; draw(now()); saveSettings();
};
const nudge = d => { $('offset').value = +(off() + d).toFixed(2); $('offset').dispatchEvent(new Event('input')); };
document.querySelectorAll('[data-nudge]').forEach(b => b.onclick = () => nudge(+b.dataset.nudge));
$('offReset').onclick = () => { $('offset').value = 0; $('offset').dispatchEvent(new Event('input')); };
['bg', 'fg', 'valign', 'blur', 'maxfont', 'offset'].forEach(id => $(id).addEventListener('input', () => {
  $('blurV').textContent = (+$('blur').value).toFixed(1);
  $('maxV').textContent = $('maxfont').value + '%';
  layoutCache.clear(); lastActive = -1; draw(now()); saveSettings();
  if ($(id) === $('offset')) simpanSesi();
}));

/* ---------- sesi (lirik + timing) kesimpen otomatis ---------- */
const SESI = 'brat-lyrics-sesi';
let sesiTimer;
function simpanSesi() {
  clearTimeout(sesiTimer);
  sesiTimer = setTimeout(() => {
    try {
      if (!state.lines.length) { localStorage.removeItem(SESI); tandaSesi(null); return; }
      const data = {
        judul: state.title,
        durasi: state.duration,
        geser: off(),
        kapan: Date.now(),
        baris: state.lines.map(l => [+l.s.toFixed(3), +l.e.toFixed(3), l.t]),
      };
      localStorage.setItem(SESI, JSON.stringify(data));
      tandaSesi(data);
    } catch (e) {}          // mode privat / storage penuh: jalan terus tanpa simpan
  }, 400);
}
function tandaSesi(data) {
  const bar = $('sesiBar');
  if (!data) { bar.hidden = true; return; }
  const menit = Math.round((Date.now() - data.kapan) / 60000);
  const kapan = menit < 1 ? 'barusan' : menit < 60 ? `${menit} menit lalu` : `${Math.round(menit / 60)} jam lalu`;
  $('sesiInfo').textContent = `Tersimpan ${kapan} · ${data.baris.length} baris`;
  bar.hidden = false;
}
function muatSesi() {
  let d;
  try { d = JSON.parse(localStorage.getItem(SESI) || 'null'); } catch (e) { return false; }
  if (!d || !Array.isArray(d.baris) || !d.baris.length) return false;
  $('offset').value = d.geser || 0;
  setLines(d.baris.map(([s, e, t]) => ({ s, e, t })), d.durasi, d.judul);
  tandaSesi(d);
  say(`Sesi sebelumnya dipulihkan (${d.baris.length} baris). Lagunya perlu dimuat ulang.`, 'ok');
  return true;
}
$('sesiHapus').onclick = () => {
  try { localStorage.removeItem(SESI); } catch (e) {}
  $('sesiBar').hidden = true;
  say('Sesi tersimpan dihapus.');
};

/* remember look settings */
const KEYS = ['size', 'valign', 'bg', 'fg', 'blur', 'maxfont', 'tapComp', 'undoBack'];
function saveSettings() {
  try { localStorage.setItem('brat-lyrics', JSON.stringify(Object.fromEntries(KEYS.map(k => [k, $(k).value])))); } catch (e) {}
}
function loadSettings() {
  try {
    const d = JSON.parse(localStorage.getItem('brat-lyrics') || '{}');
    KEYS.forEach(k => { if (d[k] != null) $(k).value = d[k]; });
  } catch (e) {}
  const [w, h] = $('size').value.split('x');
  cv.width = +w; cv.height = +h;
  $('blurV').textContent = (+$('blur').value).toFixed(1);
  $('maxV').textContent = $('maxfont').value + '%';
}

/* ---------- tap sync ---------- */
function relink() {
  const L = state.lines;
  L.forEach((l, i) => { l.e = i + 1 < L.length ? L[i + 1].s : Math.max(l.e, l.s + 3); });
}
function tapInfo() {
  const L = state.lines, i = state.tapIdx;
  if (i < L.length) {
    $('tapCount').textContent = `Baris ${i + 1} dari ${L.length} — tap pas baris ini mulai`;
    $('tapNext').textContent = L[i].t;
  } else {
    $('tapCount').textContent = 'Semua baris sudah di-tap';
    $('tapNext').textContent = 'Klik Selesai buat simpan';
  }
  $('tapBtn').disabled = i >= L.length;
  listItems.forEach((el, k) => el.classList.toggle('next', !!state.tap && k === i));
  if (listItems[i]) listItems[i].scrollIntoView({ block: 'nearest' });
}
function startTap() {
  if (!state.lines.length || state.recording || state.tap) return;
  const from = Math.min(Math.max(1, +$('tapFrom').value || 1), state.lines.length) - 1;
  pause();
  state.tap = { from, orig: state.lines.map(l => ({ ...l })), hist: [] };
  state.tapIdx = from;
  $('tapPanel').classList.add('on');
  tapInfo();
  seek(from === 0 ? 0 : Math.max(0, state.lines[from].s - off() - 3));
  play();
  say('Tap mode: tekan Spasi tiap ganti baris.', 'ok');
}
function doTap() {
  if (!state.tap || !state.playing || state.tapIdx >= state.lines.length) return;
  const l = state.lines[state.tapIdx];
  state.tap.hist.push({ s: l.s, at: now() });
  l.s = Math.max(0, now() - (+$('tapComp').value || 0) / 1000 + off());
  state.tapIdx++;
  tapInfo(); stampList(); draw(now());
  if (state.tapIdx >= state.lines.length) finishTap();
}
function undoTap() {
  if (!state.tap || state.tapIdx <= state.tap.from) return;
  state.tapIdx--;
  const h = state.tap.hist.pop();
  state.lines[state.tapIdx].s = h.s;
  tapInfo(); stampList();
  seek(Math.max(0, h.at - (+$('undoBack').value || 0)));
}
function finishTap() {
  if (!state.tap) return;
  const { from, orig } = state.tap, L = state.lines, last = state.tapIdx - 1;
  if (last >= from && last + 1 < L.length) {          // sisanya ikut bergeser sebesar tap terakhir
    const d = L[last].s - orig[last].s;
    for (let i = last + 1; i < L.length; i++) L[i].s = orig[i].s + d;
  }
  for (let i = 1; i < L.length; i++) if (L[i].s < L[i - 1].s) L[i].s = L[i - 1].s + 0.01;
  relink();
  state.tap = null; pause();
  $('tapPanel').classList.remove('on');
  listItems.forEach(el => el.classList.remove('next'));
  layoutCache.clear(); lastActive = -1; stampList();
  seek(Math.max(0, L[Math.max(from, 0)].s - off() - 1));
  simpanSesi();
  say('Timing tersimpan. Play buat cek, atau download LRC-nya.', 'ok');
}
function cancelTap() {
  if (!state.tap) return;
  state.lines = state.tap.orig;
  state.tap = null; pause();
  $('tapPanel').classList.remove('on');
  listItems.forEach(el => el.classList.remove('next'));
  lastActive = -1; stampList(); seek(0); simpanSesi();
  say('Tap dibatalin, timing balik ke semula.');
}
$('tapStart').onclick = startTap;
$('tapBtn').onmousedown = e => { e.preventDefault(); doTap(); };
$('tapUndo').onclick = undoTap;
$('tapDone').onclick = finishTap;
$('tapCancel').onclick = cancelTap;

$('dlLrc').onclick = () => {
  if (!state.lines.length) return;
  const txt = state.lines.map(l => `[${stamp(l.s)}] ${l.t}`).join('\n')
            + `\n[${stamp(state.lines[state.lines.length - 1].e)}] \n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  a.download = (state.title || 'lyrics') + '.lrc';
  a.click();
  say('LRC ke-download. Simpen biar timing-nya nggak ilang.', 'ok');
};

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (state.tap) {
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) doTap(); }
    else if (e.code === 'Backspace') { e.preventDefault(); undoTap(); }
    else if (e.code === 'Escape') cancelTap();
    return;
  }
  if (state.recording) return;
  if (e.code === 'Space') { e.preventDefault(); if (state.duration) state.playing ? pause() : play(); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); seek(now() - 5); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); seek(now() + 5); }
  else if (e.code === 'KeyT') { e.preventDefault(); startTap(); }
});

/* ---------- export ---------- */
let actx, adest;
$('export').onclick = async () => {
  if (state.recording || state.tap) return;
  if (!state.lines.length) { say('Belum ada lirik.', 'err'); return; }
  if (typeof MediaRecorder === 'undefined') { say('Browser ini nggak support MediaRecorder.', 'err'); return; }
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) { say('Browser ini nggak support perekaman video.', 'err'); return; }

  pause();
  const stream = cv.captureStream(30);
  if (state.hasAudio) {
    try {
      if (!actx) {
        actx = new AudioContext();
        adest = actx.createMediaStreamDestination();
        const src = actx.createMediaElementSource(audio);
        src.connect(adest); src.connect(actx.destination);
      }
      await actx.resume();
      adest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (err) { say('Audio nggak bisa ikut direkam: ' + err.message, 'err'); }
  }

  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    state.recording = false; pause();
    $('export').disabled = false;
    $('rec').classList.remove('on'); $('recBanner').classList.remove('on');
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: mime }));
    a.download = `${state.title || 'brat-lyrics'}.${ext}`;
    a.click();
    say(`Selesai: ${a.download}`, 'ok');
  };

  state.recording = true;
  $('export').disabled = true;
  $('rec').classList.add('on'); $('recBanner').classList.add('on');
  seek(0); rec.start(); play();
  say('Merekam… jangan pindah tab sampai lagunya kelar.', 'err');
  const timer = setInterval(() => {
    const t = now(), pct = Math.min(100, Math.round(t / state.duration * 100));
    const left = fmt(Math.max(0, state.duration - t));
    $('recText').textContent = `REC ${pct}%`;
    $('recPct').textContent = `${pct}% · sisa ${left}`;
    if (t >= state.duration - 0.05 || !state.playing) { clearInterval(timer); setTimeout(() => rec.stop(), 300); }
  }, 200);
};

/* ---------- font ---------- */
function punyaFont(nama) {          // font kepasang di sistem atau nggak
  const c = document.createElement('canvas').getContext('2d');
  const probe = 'mmmmmmmmmmlli';
  c.font = '72px monospace';
  const base = c.measureText(probe).width;
  c.font = `72px "${nama}", monospace`;
  return c.measureText(probe).width !== base;
}
function siapkanFont() {
  // webfont-nya cuma ditarik kalau Arial Narrow nggak ada, biar desktop nggak
  // download 22 KB percuma
  if (punyaFont('Arial Narrow') || !document.fonts) return;
  document.fonts.load(`100px ${FONT_WEB}`)
    .then(() => { layoutCache.clear(); lastActive = -1; draw(now()); })
    .catch(() => {});
}

loadSettings();
draw(0);
siapkanFont();
muatSesi();
