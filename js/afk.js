/* AFK front end. No framework, no keys: the server builds PumpSwap transactions, your wallet signs. */
import { createWorld } from '/js/world.js?v=5';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const S = { pools: [], sort: 'earn', min: 25, q: '', cfg: {}, pool: null, tab: 'add', slip: 2, pct: 100, toSol: true, busy: false, positions: null, updated: 0, amt: '' };
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }, del(k) { try { localStorage.removeItem(k); } catch (e) { } } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches || /iphone|ipad|android/i.test(navigator.userAgent);

/* ---------- utils ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = bytes => { let n = 0n; for (const x of bytes) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of bytes) { if (x === 0) s = '1' + s; else break; } return s; };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
function compact(n) {
  n = Number(n); if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
  if (a >= 100) return n.toFixed(0);
  if (a >= 1) return n.toFixed(2);
  if (a === 0) return '0';
  return n.toPrecision(3);
}
function fsol(n, d) { n = Number(n) || 0; if (d != null) return n.toFixed(d); const a = Math.abs(n); return a >= 1000 ? compact(n) : a >= 1 ? n.toFixed(2) : a >= 0.01 ? n.toFixed(3) : a > 0 ? n.toFixed(5) : '0'; }
const coinAmt = (raw, dec) => Number(BigInt(raw || '0')) / Math.pow(10, dec || 6);
const pctTxt = (x, d = 2) => (x * 100).toFixed(d) + '%';
const age = ms => { if (!ms) return ''; const h = (Date.now() - ms) / 36e5; return h < 1 ? Math.max(1, Math.round(h * 60)) + 'm' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd'; };
function dur(ms) { const m = Math.max(0, Math.floor(ms / 60000)); const d = Math.floor(m / 1440), h = Math.floor(m / 60) % 24, mm = m % 60; return d ? `${d}d ${h}h` : h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`; }
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }
async function api(path, body) {
  const opt = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' };
  const r = await fetch('/api/' + path, opt);
  let j = null; try { j = await r.json(); } catch (e) { }
  if (!r.ok || !j || j.ok === false) { const e = new Error((j && j.error) || ('Request failed (' + r.status + ')')); e.logs = j && j.logs; throw e; }
  return j;
}
function tokImg(p, cls = 'tok') {
  const letter = esc(((p.symbol || p.name || '?')[0] || '?').toUpperCase());
  const img = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.remove()">` : '';
  return `<span class="${cls}"><span class="ph">${letter}</span>${img}</span>`;
}
const label = p => esc(p.symbol ? '$' + p.symbol : short(p.mint));
const nameOf = p => esc(p.name || short(p.mint));

/* ---------- the world ---------- */
let world = null;
try { world = createWorld($('#world'), { mobile }); } catch (e) { console.warn('world', e); world = null; }
if (!world) document.body.classList.add('nogl');
window.__afk = { world };

/* ---------- scroll engine: sections drive the camera ---------- */
const secs = $$('main > section[data-cam]');
const awayEl = $('#away');
function layout() { secs.forEach(s => { s._top = s.offsetTop; s._h = s.offsetHeight; }); }
let lastPulse = 0, lastTx = 0;
function onScroll() {
  const y = scrollY, vh = innerHeight, mid = y + vh * 0.5;
  let i = secs.findIndex(s => mid >= s._top && mid < s._top + s._h);
  if (i < 0) i = mid < (secs[0]._top || 0) ? 0 : secs.length - 1;
  const s = secs[i], f = clamp((mid - s._top) / Math.max(1, s._h), 0, 1);
  if (world) {
    if (s.dataset.cam2) world.go(s.dataset.cam, s.dataset.cam2, f);
    else { const nx = secs[i + 1]; world.go(s.dataset.cam, nx ? nx.dataset.cam : s.dataset.cam, clamp((f - 0.62) / 0.38, 0, 1)); }
  }
  const sh = s.id === 'top' ? 0.1 + 0.32 * clamp(y / vh, 0, 1) : s.id === 'end' ? 0.14 : s.id === 'away' ? 0.3 : 0.46;
  document.documentElement.style.setProperty('--sh', sh.toFixed(3));
  $('#nav').classList.toggle('top', y < vh * 0.55);
  let cur = null, best = -1e9; for (const a of $$('#links a')) { const el = document.getElementById(a.getAttribute('href').slice(1)); if (!el) continue; const t = el.getBoundingClientRect().top; if (t < vh * 0.4 && t > best) { best = t; cur = a; } }
  $$('#links a').forEach(a => a.classList.toggle('on', a === cur));
  updAway();
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { layout(); onScroll(); });
try { new ResizeObserver(() => { layout(); onScroll(); }).observe(document.body); } catch (e) { }

/* ---------- 01: a day AFK, at the top pool's real pace ---------- */
function topPool() {
  const big = S.pools.filter(p => p.tvlSol >= 50 && p.volSol > 0).sort((a, b) => b.earnPerSolDay - a.earnPerSolDay);
  return big[0] || S.pools[0] || null;
}
function updAway() {
  if (!awayEl._h) return;
  const p = clamp((scrollY - awayEl._top) / Math.max(1, awayEl._h - innerHeight), 0, 1);
  const mins = Math.round(p * 24 * 60);
  $('#awH').textContent = String(Math.floor(mins / 60)).padStart(2, '0');
  $('#awM').textContent = String(mins % 60).padStart(2, '0');
  $('#awBar').style.width = (p * 100).toFixed(2) + '%';
  const tp = topPool(); if (!tp) return;
  const tx = Math.round((tp.txns24 || 0) * p);
  $('#awTx').textContent = tp.txns24 ? tx.toLocaleString('en-US') : '—';
  $('#awVol').textContent = compact(tp.volSol * p) + ' SOL';
  $('#awFee').textContent = fsol(tp.volSol * tp.lpBps / 1e4 * p) + ' SOL';
  $('#awYou').textContent = '+' + fsol(tp.earnPerSolDay * p, 4) + ' SOL';
  if (world && tx - lastTx > Math.max(40, (tp.txns24 || 0) / 160) && performance.now() - lastPulse > 260) { world.pulse(0.35); lastPulse = performance.now(); lastTx = tx; }
  if (tx < lastTx) lastTx = tx;
}
function fillAwayLabels() {
  const tp = topPool(); if (!tp) return;
  $('#awPool').textContent = tp.symbol ? '$' + tp.symbol : tp.name || 'the top pool';
  $('#awSym').textContent = tp.symbol ? '$' + tp.symbol : short(tp.mint);
  $('#awBps').textContent = '(' + (tp.lpBps / 100).toFixed(2) + '%)';
  updAway();
}

/* ---------- reveal on view ---------- */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
$$('.rv').forEach(el => io.observe(el));

/* ---------- wallet (Wallet Standard) ---------- */
const W = { list: [], w: null, acct: null };
function addWallet(w) {
  try {
    if (!w || !w.features || !w.name) return;
    const sol = (w.chains || []).some(c => String(c).startsWith('solana:'));
    const can = w.features['standard:connect'] && (w.features['solana:signTransaction'] || w.features['solana:signAndSendTransaction']);
    if (!sol || !can || W.list.some(x => x.name === w.name)) return;
    W.list.push(w);
    if (!W.w && store.get('afk:wallet') === w.name && w.accounts && w.accounts.length) use(w, w.accounts[0]);
    if (!$('#wModal').hidden) renderWallets();
  } catch (e) { }
}
const walletApi = Object.freeze({ register: (...ws) => { ws.forEach(addWallet); return () => { }; } });
addEventListener('wallet-standard:register-wallet', e => { try { e.detail(walletApi); } catch (_) { } });
try { dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: walletApi })); } catch (_) { }

function use(w, acct) {
  W.w = w; W.acct = acct; store.set('afk:wallet', w.name);
  $('#walletBtn').classList.add('on'); $('#walletLabel').textContent = short(acct.address);
  try { w.features['standard:events'] && w.features['standard:events'].on('change', ({ accounts }) => { if (accounts && W.w === w) { if (accounts.length) use(w, accounts[0]); else disconnect(); } }); } catch (e) { }
  loadPositions(); if (S.pool && S.pool.pool) openPool(S.pool.pool, true);
}
function disconnect() {
  try { W.w && W.w.features['standard:disconnect'] && W.w.features['standard:disconnect'].disconnect(); } catch (e) { }
  W.w = null; W.acct = null; store.set('afk:wallet', '');
  $('#walletBtn').classList.remove('on'); $('#walletLabel').textContent = 'Connect';
  S.positions = null; renderPositions(); if (S.pool) renderDrawer();
}
function renderWallets() {
  const box = $('#wList');
  $('#wTitle').textContent = W.w ? 'Your wallet' : 'Connect a wallet';
  if (W.w) {
    box.innerHTML = `<p>${esc(W.w.name)}<br><code>${esc(W.acct.address)}</code></p><button class="wopt" type="button" id="wCopy">Copy address</button><button class="wopt" type="button" id="wOut">Disconnect</button>`;
    $('#wCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(W.acct.address).then(() => toast('Address copied')); };
    $('#wOut').onclick = () => { disconnect(); $('#wModal').hidden = true; toast('Disconnected'); };
    return;
  }
  if (!W.list.length) {
    const here = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
    box.innerHTML = mobile
      ? `<p>Open AFK inside your wallet app's browser:</p>
         <a class="wopt" href="https://phantom.app/ul/browse/${here}?ref=${ref}">Open in Phantom</a>
         <a class="wopt" href="https://solflare.com/ul/v1/browse/${here}?ref=${ref}">Open in Solflare</a>`
      : `<p>No Solana wallet found in this browser. Install one, then reload:</p>
         <a class="wopt" href="https://phantom.com/download" target="_blank" rel="noopener">Phantom</a>
         <a class="wopt" href="https://solflare.com/download" target="_blank" rel="noopener">Solflare</a>
         <a class="wopt" href="https://backpack.app/download" target="_blank" rel="noopener">Backpack</a>`;
    return;
  }
  box.innerHTML = W.list.map((w, i) => `<button class="wopt" data-i="${i}" type="button">${w.icon ? `<img src="${esc(w.icon)}" alt="">` : ''}${esc(w.name)}<small>Detected</small></button>`).join('');
}
function connect() { renderWallets(); $('#wModal').hidden = false; }
$('#wList').addEventListener('click', async e => {
  const b = e.target.closest('button.wopt[data-i]'); if (!b) return;
  const w = W.list[+b.dataset.i];
  try {
    b.disabled = true;
    const r = await w.features['standard:connect'].connect();
    const acct = (r && r.accounts && r.accounts[0]) || (w.accounts && w.accounts[0]);
    if (!acct) throw new Error('No account shared');
    $('#wModal').hidden = true; use(w, acct); toast('Connected ' + short(acct.address));
  } catch (err) { toast(err && err.message ? err.message : 'Connection cancelled'); }
  finally { b.disabled = false; }
});
$('#walletBtn').addEventListener('click', connect);
$('#wClose').addEventListener('click', () => { $('#wModal').hidden = true; });
$('#wModal').addEventListener('click', e => { if (e.target.id === 'wModal') $('#wModal').hidden = true; });
const needWallet = () => { if (!W.w) { connect(); return true; } return false; };

async function waitFor(sig) {
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await new Promise(r => setTimeout(r, 1300));
    try {
      const s = await api('status?sig=' + sig);
      if (s.err) throw Object.assign(new Error('The transaction failed on-chain.'), { chain: s.err });
      if (s.status === 'confirmed' || s.status === 'finalized') return true;
    } catch (e) { if (e.chain) throw e; }
  }
  throw new Error('Not confirmed after 90 seconds. Check the link below before trying again.');
}
async function signSend(txs, step) {
  const f = W.w.features, chain = 'solana:mainnet', bytes = txs.map(t => fromB64(t.tx)), sigs = [];
  if (bytes.length === 1 && f['solana:signAndSendTransaction']) {
    step('sign');
    const [r] = await f['solana:signAndSendTransaction'].signAndSendTransaction({ account: W.acct, chain, transaction: bytes[0], options: { commitment: 'confirmed', preflightCommitment: 'processed', maxRetries: 3 } });
    const sig = typeof r.signature === 'string' ? r.signature : b58(r.signature); sigs.push(sig);
    step('confirm', sigs); await waitFor(sig); return sigs;
  }
  if (f['solana:signTransaction']) {
    step('sign');
    const outs = await f['solana:signTransaction'].signTransaction(...bytes.map(t => ({ account: W.acct, chain, transaction: t })));
    for (let i = 0; i < outs.length; i++) {
      step('confirm', sigs, i);
      const { sig } = await api('send', { tx: toB64(outs[i].signedTransaction) }); sigs.push(sig);
      step('confirm', sigs, i); await waitFor(sig);
    }
    return sigs;
  }
  for (let i = 0; i < bytes.length; i++) {
    step('sign', sigs, i);
    const [r] = await f['solana:signAndSendTransaction'].signAndSendTransaction({ account: W.acct, chain, transaction: bytes[i] });
    const sig = typeof r.signature === 'string' ? r.signature : b58(r.signature); sigs.push(sig);
    step('confirm', sigs, i); await waitFor(sig);
  }
  return sigs;
}

/* ---------- AFK records: when you went AFK in each pool (this browser only) ---------- */
const recKey = pool => `afk:dep:${W.acct ? W.acct.address : ''}:${pool}`;
function getRec(pool) { try { return JSON.parse(store.get(recKey(pool)) || 'null'); } catch (e) { return null; } }
function addRec(pool, sol) { const r = getRec(pool) || { t0: Date.now(), sol: 0 }; r.sol = (r.sol || 0) + sol; store.set(recKey(pool), JSON.stringify(r)); }

/* ---------- pools ---------- */
const KEY = { earn: p => p.earnPerSolDay, tvl: p => p.tvlSol, vol: p => p.volSol, chg: p => p.change24 };
function visible() {
  const q = S.q.trim().toLowerCase();
  return S.pools.filter(p => p.tvlSol >= S.min && (!q || (p.name + ' ' + p.symbol + ' ' + p.mint).toLowerCase().includes(q))).sort((x, y) => KEY[S.sort](y) - KEY[S.sort](x));
}
function renderPools() {
  const rows = $('#rows'), list = visible();
  if (!list.length) {
    rows.innerHTML = `<div class="empty"><b>${S.q ? 'No pool on the board matches that.' : 'No pools this size right now.'}</b>${S.q ? 'Paste the coin address above to look it up on-chain.' : 'Try a smaller pool size.'}</div>`;
    return;
  }
  const top = Math.max(...list.map(p => p.earnPerSolDay), 1e-9);
  rows.innerHTML = list.map((p, i) => `
    <div class="tr" data-pool="${esc(p.pool)}" style="animation-delay:${Math.min(i, 14) * 22}ms">
      <span class="c-pool">${tokImg(p)}<span class="nm"><b>${nameOf(p)}${p.tvlSol < 25 ? '<span class="tiny-tag">small</span>' : ''}</b><small>${label(p)} · ${compact(p.mcapSol)} SOL mcap${p.created ? ' · ' + age(p.created) : ''}<span class="m-sub"> · ${compact(p.tvlSol)} SOL pool</span></small></span></span>
      <span class="c-earn"><span class="big">${pctTxt(p.earnPerSolDay)}</span><span class="ebar"><i style="width:${Math.max(3, Math.round(p.earnPerSolDay / top * 100))}%"></i></span></span>
      <span class="c-tvl num">${compact(p.tvlSol)} SOL</span>
      <span class="c-vol num">${compact(p.volSol)} SOL</span>
      <span class="c-fee num hide-m">${(p.lpBps / 100).toFixed(2)}%</span>
      <span class="c-chg num hide-m ${p.change24 >= 0 ? 'up' : 'down'}">${p.change24 >= 0 ? '+' : ''}${Math.abs(p.change24) >= 1000 ? compact(p.change24) : (+p.change24).toFixed(1)}%</span>
      <span class="c-go"><button class="btn primary xs" type="button">Go AFK</button></span>
    </div>`).join('');
}
function renderStats() {
  const P = S.pools; if (!P.length) return;
  const tvl = P.reduce((a, p) => a + p.tvlSol, 0), vol = P.reduce((a, p) => a + p.volSol, 0), fees = P.reduce((a, p) => a + p.volSol * p.lpBps / 10000, 0);
  const set = (k, v) => { const el = $(`#stats b[data-k="${k}"]`); if (el) el.innerHTML = v; };
  set('n', P.length); set('tvl', compact(tvl) + '<small>SOL</small>'); set('vol', compact(vol) + '<small>SOL</small>'); set('fees', compact(fees) + '<small>SOL</small>');
}
function renderHeroLive() {
  const p = topPool(), el = $('#heroLive'); if (!p || !el) return;
  el.innerHTML = `${tokImg(p)}<span>Top pool now</span><b>${label(p)}</b><em>${pctTxt(p.earnPerSolDay, 1)} a day</em><small>· ${compact(p.tvlSol)} SOL pool</small>`;
  el.dataset.pool = p.pool; el.hidden = false;
}

function tickUpdated() {
  const el = $('#updated'); if (!S.updated) return;
  const s = Math.round((Date.now() - S.updated) / 1000);
  el.classList.add('ok');
  $('span', el).textContent = 'Live · updated ' + (s < 5 ? 'just now' : s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago');
}
setInterval(tickUpdated, 1000);
async function loadPools(quiet) {
  try {
    const j = await api('pools');
    S.pools = j.pools || []; S.updated = j.updated || Date.now();
    renderPools(); renderStats(); renderHeroLive(); calcPools(); fillAwayLabels(); tickUpdated();
  } catch (e) {
    if (quiet) return;
    $('#rows').innerHTML = `<div class="empty"><b>Could not reach the market.</b><button class="btn ghost sm" id="retry" type="button" style="margin-top:10px">Retry connection ↻</button></div>`;
    $('#retry').onclick = () => loadPools();
    $('#updated').classList.remove('ok'); $('#updated span').textContent = 'Market offline';
  }
}
setInterval(() => { if (!document.hidden && !S.busy) loadPools(true); }, 60000);
$('#rows').addEventListener('click', e => { const r = e.target.closest('.tr'); if (r) openPool(r.dataset.pool); });
$('#th').addEventListener('click', e => { const b = e.target.closest('.sort'); if (!b) return; S.sort = b.dataset.s; $$('#th .sort').forEach(x => x.classList.toggle('on', x === b)); renderPools(); });
$('#size').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.min = +b.dataset.m; $$('#size button').forEach(x => x.classList.toggle('on', x === b)); renderPools(); });
$('#findIn').addEventListener('input', e => { const v = e.target.value.trim(); if (!isAddr(v)) { S.q = v; renderPools(); } });
$('#find').addEventListener('submit', e => {
  e.preventDefault(); const v = $('#findIn').value.trim(); if (!v) return;
  if (isAddr(v)) { openPool(v); return; }
  S.q = v; S.min = 0; $$('#size button').forEach(x => x.classList.toggle('on', x.dataset.m === '0')); renderPools();
});

/* ---------- the drawer ---------- */
function openDrawer() { $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#veil').hidden = false; document.documentElement.style.overflow = 'hidden'; }
function closeDrawer() { if (S.busy) return; $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#veil').hidden = true; document.documentElement.style.overflow = ''; S.pool = null; }
$('#dClose').addEventListener('click', closeDrawer); $('#veil').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#wModal').hidden) $('#wModal').hidden = true; else if (S.pool) closeDrawer(); } });

async function openPool(id, quiet, tab, amt) {
  if (!quiet) { S.pool = { pool: id, loading: true }; S.tab = tab || 'add'; S.amt = amt || ''; renderDrawer(); openDrawer(); }
  try {
    const j = await api('pool?id=' + encodeURIComponent(id) + (W.acct ? '&user=' + W.acct.address : ''));
    if (S.pool && (S.pool.pool === id || S.pool.mint === id || S.pool.pool === j.pool.pool || quiet)) { S.pool = j.pool; renderDrawer(); }
  } catch (e) {
    if (!quiet) { S.pool = { pool: id, error: e.message }; renderDrawer(); }
  }
}
function estimate(p, solIn) {
  try {
    const lamports = BigInt(Math.floor(solIn * 1e9)); if (lamports <= 0n) return null;
    const fee = BigInt(S.cfg.feeBps || 0); const jug = lamports * fee / 10000n; const budget = lamports - jug;
    const Rb = BigInt(p.reserves.coin), Rq = BigInt(p.reserves.solLamports), L = BigInt(p.lpSupply), vq = BigInt(p.reserves.vqr || '0');
    const f = p.feeBps, cd = (a, b) => (a + b - 1n) / b;
    const cost = b => { const q = cd((Rq + vq) * b, Rb - b); const g = bp => cd(q * BigInt(bp), 10000n); return { q, lf: g(f.lp), t: q + g(f.lp) + g(f.protocol) + g(f.creator) }; };
    let lo = 0n, hi = Rb / 2n;
    for (let i = 0; i < 90 && hi - lo > 1n; i++) { const m = (lo + hi) / 2n, c = cost(m); if (c.t >= budget) { hi = m; continue; } const D = budget - c.t; if (m * (Rq + c.q + c.lf) < D * (Rb - m)) lo = m; else hi = m; }
    const c = cost(lo), D = budget - c.t, Rq2 = Rq + c.q + c.lf, Rb2 = Rb - lo;
    let lp = lo * L / Rb2; const lq = D * L / Rq2; if (lq < lp) lp = lq;
    const share = Number(lp) / Number(L + lp);
    const value = share * 2 * Number(Rq2 + D) / 1e9;
    return { jug: Number(jug) / 1e9, swap: Number(c.t) / 1e9, coin: Number(lo), dep: Number(D) / 1e9, share, value, earnDay: share * p.volSol * p.lpBps / 10000 };
  } catch (e) { return null; }
}
function renderDrawer() {
  const p = S.pool, el = $('#dIn'); if (!p) return;
  if (p.loading) { el.innerHTML = `<div class="d-top"><span class="tok"></span><div><h3>Finding the pool…</h3><small><span class="loader"></span>Reading PumpSwap on-chain</small></div></div><div class="skel" style="margin-top:20px;border-radius:12px;border:0"></div>`; return; }
  if (p.error) { el.innerHTML = `<div class="empty" style="margin-top:30px"><b>${esc(p.error)}</b><button class="btn ghost sm" type="button" id="dBack">Back to the pools</button></div>`; $('#dBack').onclick = closeDrawer; return; }
  const sym = p.symbol ? '$' + p.symbol : 'the coin';
  const you = p.you, hasPos = you && BigInt(you.lp || '0') > 0n;
  const f = p.feeBps || { lp: p.lpBps, protocol: 0, creator: 0 };
  el.innerHTML = `
    <div class="d-top">${tokImg(p)}<div><h3>${nameOf(p)}</h3>
      <small>${p.symbol ? esc('$' + p.symbol) + ' · ' : ''}<a href="https://solscan.io/account/${esc(p.pool)}" target="_blank" rel="noopener">pool ${short(p.pool)}</a> · <a href="https://dexscreener.com/solana/${esc(p.pool)}" target="_blank" rel="noopener">chart</a></small></div></div>
    <div class="kv">
      <div><span>Earns / day</span><b class="up">${p.volSol ? pctTxt(p.earnPerSolDay) : '—'}</b></div>
      <div><span>Pool size</span><b>${compact(p.tvlSol)} SOL</b></div>
      <div><span>24h volume</span><b>${p.volSol ? compact(p.volSol) + ' SOL' : '—'}</b></div>
      <div><span>Market cap</span><b>${compact(p.mcapSol)} SOL</b></div>
    </div>
    <p class="feeline">Each trade pays ${((f.lp + f.protocol + f.creator) / 100).toFixed(2)}%: <b>${(f.lp / 100).toFixed(2)}% to the pool's LPs</b>, ${(f.protocol / 100).toFixed(2)}% to PumpSwap, ${(f.creator / 100).toFixed(2)}% to the coin's creator.</p>
    ${hasPos ? `<div class="you">You're AFK here: <b>${fsol(you.valueSol)} SOL</b> · ${pctTxt(you.share, 3)} of the pool · about ${fsol(you.share * p.volSol * p.lpBps / 10000)} SOL a day</div>` : ''}
    ${!p.solPool ? `<div class="status show err">This pool is not paired with SOL. AFK handles SOL pools only for now.</div>` : `
    <div class="tabs"><button type="button" data-t="add" class="${S.tab === 'add' ? 'on' : ''}">Go AFK</button><button type="button" data-t="remove" class="${S.tab === 'remove' ? 'on' : ''}">Withdraw</button></div>
    <div id="pane"></div>`}
    <div class="status" id="st"></div>`;
  $$('.tabs button', el).forEach(b => b.onclick = () => { if (S.busy) return; S.tab = b.dataset.t; renderDrawer(); });
  if (p.solPool) S.tab === 'add' ? paneAdd(p, sym) : paneRemove(p, sym);
}
function moveTable(V, v, sym) {
  return `<p><b>If the price moves</b> before you withdraw, your position changes like this, before any fees earned:</p><table><tr><th>${esc(sym)}</th><th>Position</th><th>vs. ${fsol(v)} SOL in</th></tr>${[[-75, 0.25], [-50, 0.5], [100, 2], [300, 4]].map(([pc, r]) => { const lp = V * Math.sqrt(r), d = lp / v - 1; return `<tr><td>${pc > 0 ? '+' : ''}${pc}%</td><td>${fsol(lp)} SOL</td><td class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}%</td></tr>`; }).join('')}</table>`;
}
function paneAdd(p, sym) {
  const bal = p.you ? p.you.sol : null;
  $('#pane').innerHTML = `
    <div class="field"><div class="row1"><span>You put in</span>${bal != null ? `<button type="button" id="max">Balance ${fsol(bal)} SOL</button>` : ''}</div>
      <div class="row2"><input id="amt" inputmode="decimal" placeholder="0.0" aria-label="SOL amount" value="${esc(S.amt)}"><span class="unit">SOL</span></div></div>
    <div class="chips" id="quick">${[0.1, 0.5, 1, 5].map(v => `<button class="chip" type="button" data-v="${v}">${v} SOL</button>`).join('')}</div>
    <div class="slip"><span>Max price move</span><div class="chips" id="slip">${[1, 2, 5].map(v => `<button class="chip ${S.slip === v ? 'on' : ''}" type="button" data-v="${v}">${v}%</button>`).join('')}</div></div>
    <div class="prev" id="prev"></div>
    <div class="sim" id="sim" hidden></div>
    <button class="btn primary go" id="goAdd" type="button">${W.w ? 'Go AFK' : 'Connect wallet'}</button>
    <p class="fine">Your wallet signs. LP tokens go to your wallet.</p>`;
  const amt = $('#amt');
  const upd = () => {
    S.amt = amt.value;
    const v = parseFloat(amt.value.replace(',', '.'));
    const e = v > 0 ? estimate(p, v) : null;
    const dec = p.decimals || 6;
    $('#prev').innerHTML = e ? `
      ${e.jug ? `<div><span>AFK fee (${(S.cfg.feeBps / 100).toFixed(1)}%)</span><b>${fsol(e.jug, 4)} SOL</b></div>` : ''}
      <div><span>Swapped for ${esc(sym)}</span><b>${fsol(e.swap)} SOL → ${compact(e.coin / Math.pow(10, dec))}</b></div>
      <div><span>Added to the pool</span><b>${fsol(e.dep)} SOL + ${compact(e.coin / Math.pow(10, dec))}</b></div>
      <div><span>Your share of the pool</span><b>${pctTxt(e.share, 3)}</b></div>
      <div class="hi"><span>Earns at the last 24h pace</span><b>${p.volSol ? '≈ ' + fsol(e.earnDay) + ' SOL / day' : '—'}</b></div>` : '';
    const sim = $('#sim');
    if (!e) { sim.hidden = true; return; }
    sim.hidden = false; sim.innerHTML = moveTable(e.value, v, sym);
  };
  amt.addEventListener('input', upd); upd();
  $('#quick').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; amt.value = b.dataset.v; upd(); };
  $('#slip').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; S.slip = +b.dataset.v; $$('#slip .chip').forEach(x => x.classList.toggle('on', x === b)); };
  const mx = $('#max'); if (mx) mx.onclick = () => { amt.value = Math.max(0, bal - 0.012).toFixed(3); upd(); };
  $('#goAdd').onclick = async () => {
    if (needWallet()) return;
    const v = parseFloat(amt.value.replace(',', '.'));
    if (!(v >= 0.01)) { toast('Enter at least 0.01 SOL'); amt.focus(); return; }
    await run('add', { kind: 'add', pool: p.pool, user: W.acct.address, sol: v, slippage: S.slip }, q => `Adds ${fsol(q.depositSol)} SOL + ${compact(coinAmt(q.depositCoin, q.decimals))} ${esc(sym)} · ${pctTxt(q.share, 3)} of the pool`, () => addRec(p.pool, v));
  };
}
function paneRemove(p, sym) {
  const you = p.you, has = you && BigInt(you.lp || '0') > 0n;
  if (!W.w || !has) {
    $('#pane').innerHTML = `<div class="empty" style="padding:24px 8px">${W.w ? `<b>Nothing here yet.</b>Go AFK in this pool first, then come back to withdraw.` : `<b>Connect to see your position.</b><button class="btn primary sm" id="cw" type="button" style="margin-top:10px">Connect wallet</button>`}</div>`;
    const cw = $('#cw'); if (cw) cw.onclick = connect; return;
  }
  $('#pane').innerHTML = `
    <div class="chips" id="pcts">${[25, 50, 75, 100].map(v => `<button class="chip ${S.pct === v ? 'on' : ''}" type="button" data-v="${v}">${v}%</button>`).join('')}</div>
    <label class="toggle"><span>Get it all back as SOL</span><span class="sw"><input type="checkbox" id="toSol" ${S.toSol ? 'checked' : ''}><i></i></span></label>
    <div class="slip"><span>Max price move</span><div class="chips" id="slip">${[1, 2, 5].map(v => `<button class="chip ${S.slip === v ? 'on' : ''}" type="button" data-v="${v}">${v}%</button>`).join('')}</div></div>
    <div class="prev" id="prev"></div>
    <button class="btn primary go" id="goRm" type="button">Withdraw</button>
    <p class="fine">AFK charges nothing to withdraw. Network fees only.</p>`;
  const upd = () => {
    const fr = S.pct / 100, dec = p.decimals || 6;
    const coin = coinAmt(you.coinInPool, dec) * fr, solv = you.solInPool * fr;
    $('#prev').innerHTML = S.toSol
      ? `<div><span>From the pool</span><b>${fsol(solv)} SOL + ${compact(coin)} ${esc(sym)}</b></div><div class="hi"><span>You get about</span><b>${fsol(solv * 2 * (1 - p.totalBps / 10000))} SOL</b></div>`
      : `<div class="hi"><span>You get about</span><b>${fsol(solv)} SOL + ${compact(coin)}</b></div>`;
  };
  upd();
  $('#pcts').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; S.pct = +b.dataset.v; $$('#pcts .chip').forEach(x => x.classList.toggle('on', x === b)); upd(); };
  $('#toSol').onchange = e => { S.toSol = e.target.checked; upd(); };
  $('#slip').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; S.slip = +b.dataset.v; $$('#slip .chip').forEach(x => x.classList.toggle('on', x === b)); };
  $('#goRm').onclick = () => run('remove', { kind: 'remove', pool: p.pool, user: W.acct.address, pct: S.pct, toSol: S.toSol, slippage: S.slip }, q => q.toSol ? `Withdraws ${q.pct}% and sells the coin side: about ${fsol(q.solOut + q.sellSol)} SOL` : `Withdraws ${q.pct}%: about ${fsol(q.solOut)} SOL + ${compact(coinAmt(q.coinOut, q.decimals))} ${esc(sym)}`, () => { if (S.pct === 100) store.del(recKey(p.pool)); });
}
async function run(kind, body, describe, onDone) {
  if (S.busy) return; S.busy = true;
  const st = $('#st'); const btn = $(kind === 'add' ? '#goAdd' : '#goRm'); if (btn) btn.disabled = true;
  const steps = ['Build and simulate the transaction', 'Approve in your wallet', 'Confirm on Solana'];
  let line = '', sigs = [], idx = 0, total = 1;
  const draw = (cur, err) => {
    st.className = 'status show ' + (err ? 'err' : cur >= 3 ? 'ok' : 'wait');
    const links = sigs.map((s, i) => `<a href="https://solscan.io/tx/${s}" target="_blank" rel="noopener">${total > 1 ? 'Step ' + (i + 1) + ' on Solscan' : 'View on Solscan'}</a>`).join(' · ');
    st.innerHTML = (err ? `<b>${esc(err.message || err)}</b>${err.logs ? `<pre>${esc(err.logs.join('\n'))}</pre>` : ''}` : cur >= 3 ? `<b>${kind === 'add' ? 'Done. You are AFK. Every trade in this pool now pays you.' : 'Withdrawn to your wallet.'}</b>` : `<b><span class="loader"></span>${esc(line || 'Working…')}</b>`)
      + (!err && cur < 3 ? `<ol>${steps.map((t, i) => `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}">${i < cur ? '✓ ' : ''}${t}${i === 2 && total > 1 ? ` (${Math.min(idx + 1, total)} of ${total})` : ''}</li>`).join('')}</ol>` : '')
      + (links ? `<div style="margin-top:8px">${links}</div>` : '');
  };
  try {
    line = 'Checking the pool and simulating…'; draw(0);
    const r = await api('tx', body);
    total = r.txs.length; line = describe(r.quote) + (total > 1 ? ' · two signatures' : ''); draw(1);
    await signSend(r.txs, (what, s, i) => { if (s) sigs = s.slice(); if (i != null) idx = i; draw(what === 'sign' ? 1 : 2); });
    draw(3); toast(kind === 'add' ? 'You are AFK.' : 'Withdrawn.');
    if (onDone) onDone();
    if (world) world.pulse(1.2);
    setTimeout(() => { if (S.pool && S.pool.pool) openPool(S.pool.pool, true); loadPositions(); }, 1500);
  } catch (e) {
    const msg = /reject|denied|cancel/i.test(e && e.message || '') ? new Error('You cancelled in the wallet. Nothing was sent.') : e;
    draw(0, msg);
  } finally { S.busy = false; if (btn) btn.disabled = false; }
}

/* ---------- 05: your AFK ---------- */
function renderPositions() {
  const box = $('#pos'); $('#refreshPos').hidden = !W.w;
  if (!W.w) { box.innerHTML = `<div class="connect-card"><div class="ico">A</div><div><h3>Everything you left running, in one place</h3><p>Connect a wallet to see each PumpSwap pool it's in, what it's worth now, and how long you've been AFK there. Positions added on pump.fun show up too.</p></div><button class="btn primary" id="cw2" type="button">Connect wallet</button></div>`; $('#cw2').onclick = connect; return; }
  if (S.positions == null) { box.innerHTML = '<div class="skel" style="border-radius:18px;border:0;height:120px"></div>'; return; }
  if (S.positions.error) { box.innerHTML = `<div class="connect-card"><p>${esc(S.positions.error)}</p><button class="btn ghost sm" id="rp" type="button">Retry</button></div>`; $('#rp').onclick = loadPositions; return; }
  if (!S.positions.length) { box.innerHTML = `<div class="connect-card"><div class="ico">A</div><div><h3>Nothing running yet</h3><p>Pick a pool from the board and go AFK with as little as 0.01 SOL.</p></div><a class="btn primary" href="#pools">See the pools</a></div>`; return; }
  const now = Date.now();
  let tot = 0, day = 0, since = 0, earned = 0, rate = 0;
  const cards = S.positions.map(p => {
    const rec = getRec(p.pool), rps = (p.earnDaySol || 0) / 86400;
    tot += p.valueSol; day += p.earnDaySol || 0; rate += rps;
    let afk = '—', est = '—', base = 0;
    if (rec && rec.t0) { const ms = now - rec.t0; since = Math.max(since, ms); afk = dur(ms); base = rps * ms / 1000; earned += base; est = fsol(base, 5); }
    return `<div class="pcard"><span class="c-pool">${tokImg(p)}<span class="nm"><b>${nameOf(p)}</b><small>${label(p)} · ${pctTxt(p.share, 3)} of the pool</small></span></span>
      <span><span class="lbl">Value</span><span class="val">${fsol(p.valueSol)} SOL</span></span>
      <span><span class="lbl">AFK for</span><span class="val">${rec ? `<span class="afk-t"><i></i>${afk}</span>` : '<span class="afk-t" style="color:var(--mut)">added elsewhere</span>'}</span></span>
      <span><span class="lbl">Earned (est.)</span><span class="val ${rec ? 'tick' : ''}" ${rec ? `data-b="${base}" data-r="${rps}" data-t="${now}"` : ''}>${rec ? est : '—'}</span></span>
      <span><span class="lbl">Per day</span><span class="val">${p.volSol ? '≈ ' + fsol(p.earnDaySol) : '—'}</span></span>
      <span class="acts"><button class="btn ghost xs" data-a="add" data-pool="${esc(p.pool)}" type="button">Add</button><button class="btn primary xs" data-a="remove" data-pool="${esc(p.pool)}" type="button">Withdraw</button></span></div>`;
  }).join('');
  box.innerHTML = `<div class="pos-sum">
      <div><span>Value now</span><b>${fsol(tot)} SOL</b></div>
      <div><span>Earning per day (≈)</span><b>${fsol(day)} SOL</b></div>
      <div><span>Longest AFK</span><b>${since ? dur(since) : '—'}</b></div>
      <div><span>Earned while away (est.)</span><b class="tick" data-b="${earned}" data-r="${rate}" data-t="${now}">${earned ? fsol(earned, 5) : '—'}</b></div>
    </div><div class="pcards">${cards}</div>
    <p class="fine">Estimates use each pool's last 24h pace since you went AFK in this browser. The value is read from the pool on-chain.</p>`;
}
setInterval(() => { $$('#pos .tick[data-r]').forEach(el => { const b = +el.dataset.b, r = +el.dataset.r, t = +el.dataset.t; if (!r) return; el.textContent = fsol(b + r * (Date.now() - t) / 1000, 6); }); }, 1000);
$('#pos').addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; openPool(b.dataset.pool, false, b.dataset.a); });
$('#refreshPos').addEventListener('click', loadPositions);
async function loadPositions() {
  if (!W.w) return renderPositions();
  S.positions = null; renderPositions();
  try { const j = await api('positions?user=' + W.acct.address); S.positions = j.positions; }
  catch (e) { S.positions = { error: e.message }; }
  renderPositions();
}

/* ---------- 04: earnings calculator ---------- */
const C = { list: [], p: null, amt: 1 };
function calcPools() {
  C.list = S.pools.filter(p => p.tvlSol >= 25).sort((a, b) => b.earnPerSolDay - a.earnPerSolDay).slice(0, 30);
  if (!C.list.length) C.list = S.pools.slice(0, 30);
  if (!C.p || !C.list.some(p => p.pool === C.p.pool)) C.p = C.list[0] || null;
  else C.p = C.list.find(p => p.pool === C.p.pool);
  $('#cList').innerHTML = C.list.map(p => `<button type="button" role="option" data-pool="${esc(p.pool)}" class="${C.p && p.pool === C.p.pool ? 'on' : ''}">${tokImg(p)}<b>${nameOf(p)}</b><em>${pctTxt(p.earnPerSolDay, 1)}</em></button>`).join('');
  calcRender();
}
function calcRender() {
  const p = C.p, v = C.amt;
  $('#cCur').innerHTML = p ? `${tokImg(p)}<span class="t">${nameOf(p)}<small>${label(p)} · ${compact(p.tvlSol)} SOL pool · ${pctTxt(p.earnPerSolDay, 1)} a day</small></span>` : 'No pools loaded';
  const set = (id, t) => { $(id).textContent = t; };
  if (!p || !(v > 0)) { ['#cDay', '#cWeek', '#cMonth', '#cShare'].forEach(id => set(id, '—')); $('#cSim').innerHTML = ''; return; }
  const dep = v * (1 - (S.cfg.feeBps || 0) / 1e4) * (1 - p.totalBps / 2e4);
  const share = dep / (p.tvlSol + dep), day = share * p.volSol * p.lpBps / 1e4;
  set('#cDay', fsol(day)); set('#cWeek', fsol(day * 7) + ' SOL'); set('#cMonth', fsol(day * 30) + ' SOL'); set('#cShare', pctTxt(share, 3));
  $('#cSim').innerHTML = moveTable(dep, v, p.symbol ? '$' + p.symbol : 'the coin');
}
const pickClose = () => { $('#cList').hidden = true; $('#cPick').classList.remove('open'); };
$('#cPickBtn').addEventListener('click', e => { e.stopPropagation(); const open = $('#cList').hidden; $('#cList').hidden = !open; $('#cPick').classList.toggle('open', open); });
$('#cList').addEventListener('click', e => { const b = e.target.closest('[data-pool]'); if (!b) return; C.p = C.list.find(p => p.pool === b.dataset.pool); $$('#cList button').forEach(x => x.classList.toggle('on', x === b)); pickClose(); calcRender(); });
document.addEventListener('click', e => { if (!e.target.closest('#cPick')) pickClose(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') pickClose(); });
$('#cAmts').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; C.amt = +b.dataset.v; $('#cAmt').value = ''; $$('#cAmts .chip').forEach(x => x.classList.toggle('on', x === b)); calcRender(); });
$('#cAmt').addEventListener('input', e => { const v = parseFloat(e.target.value.replace(',', '.')); if (v > 0) { C.amt = v; $$('#cAmts .chip').forEach(x => x.classList.remove('on')); } calcRender(); });
$('#cGo').addEventListener('click', () => { if (C.p) openPool(C.p.pool, false, 'add', String(C.amt)); });

/* ---------- 06: the transaction, step by step ---------- */
let flowI = 0;
setInterval(() => { if (document.hidden) return; const fs = $$('#flow .fs'); fs.forEach((el, i) => el.classList.toggle('on', i === flowI)); flowI = (flowI + 1) % fs.length; }, 1500);

/* ---------- config ---------- */
async function loadConfig() {
  try {
    S.cfg = await api('config');
    if (S.cfg.ca) {
      const ca = esc(S.cfg.ca), xh = S.cfg.x ? (String(S.cfg.x).startsWith('http') ? S.cfg.x : 'https://x.com/' + String(S.cfg.x).replace(/^@/, '')) : '';
      $('#caBox').innerHTML = `<div class="ca"><span class="ca-l">$AFK</span><code>${short(S.cfg.ca)}</code><button type="button" id="caCopy">Copy</button><a href="https://pump.fun/coin/${ca}" target="_blank" rel="noopener">Buy</a><a href="https://dexscreener.com/solana/${ca}" target="_blank" rel="noopener">Chart</a>${xh ? `<a href="${esc(xh)}" target="_blank" rel="noopener">X</a>` : ''}</div><p class="fine">The only $AFK contract is the one shown here.</p>`;
      $('#caCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(S.cfg.ca).then(() => toast('Address copied')); };
    }
    if (S.cfg.feeBps) $('#feeFaq').innerHTML = `${(S.cfg.feeBps / 100).toFixed(1)}% of each deposit goes to AFK${S.cfg.jug ? ` (<code>${esc(S.cfg.jug)}</code>)` : ''}. Withdrawals are free. You also pay Solana's network fees and a small refundable rent for new token accounts.`;
  } catch (e) { S.cfg = { feeBps: 0 }; }
}

/* ---------- boot ---------- */
layout(); onScroll();
requestAnimationFrame(() => { document.body.classList.remove('loading'); $$('.hero .rv').forEach(el => el.classList.add('vis')); });
renderPositions();
const qp = new URLSearchParams(location.search).get('pool') || (isAddr(location.hash.slice(1)) ? location.hash.slice(1) : '');
loadConfig().then(() => { loadPools(); if (qp) openPool(qp); });
