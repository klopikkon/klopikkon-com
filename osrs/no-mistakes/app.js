function dataBase() {
  const path = location.pathname;
  if (path.endsWith("/index.html")) return path.slice(0, path.lastIndexOf("/") + 1);
  if (path.endsWith("/")) return path;
  const last = path.split("/").pop();
  if (last && !last.includes(".")) return path + "/";
  return path.replace(/\/[^/]+$/, "/");
}
const BASE = dataBase();
const LS_SNAP = "no-mistakes-snapshots-v1";
const LS_EVENTS = "no-mistakes-events-v1";
const LS_WEEK = "no-mistakes-weekkc-v1";
const WOM = "https://api.wiseoldman.net/v2";

const state = {
  group: null,
  drops: {},
  snapshots: { snapshots: [], events: [] },
  wom: {},
  week: {},
  boss: "alchemical-hydra",
};

function $(sel, el = document) { return el.querySelector(sel); }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;"
  }[c]));
}
function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-AU");
}
function fmtGp(n) {
  if (n == null) return "—";
  const x = Number(n);
  if (x >= 1e6) return (x / 1e6).toFixed(x >= 1e8 ? 0 : 1) + "M";
  if (x >= 1e3) return (x / 1e3).toFixed(0) + "K";
  return fmt(x);
}
function findMember(idOrRsn) {
  const q = String(idOrRsn || "").toLowerCase();
  return state.group.members.find(m =>
    m.id === q || m.rsn.toLowerCase() === q || m.display.toLowerCase() === q
  );
}
function route() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  return { parts, raw };
}

async function loadJSON(path) {
  const res = await fetch(BASE + path + "?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("Missing " + path);
  return res.json();
}

function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SNAP) || "null");
    if (s && Array.isArray(s.snapshots)) {
      const ids = new Set(s.snapshots.map(x => x.id));
      for (const row of state.snapshots.snapshots) if (!ids.has(row.id)) s.snapshots.push(row);
      state.snapshots.snapshots = s.snapshots;
    }
    const ev = JSON.parse(localStorage.getItem(LS_EVENTS) || "null");
    if (Array.isArray(ev)) state.snapshots.events = ev;
    const wk = JSON.parse(localStorage.getItem(LS_WEEK) || "null");
    if (wk && typeof wk === "object") state.week = wk;
  } catch (e) { /* ignore */ }
}
function saveLocal() {
  localStorage.setItem(LS_SNAP, JSON.stringify({ snapshots: state.snapshots.snapshots }));
  localStorage.setItem(LS_EVENTS, JSON.stringify(state.snapshots.events || []));
  localStorage.setItem(LS_WEEK, JSON.stringify(state.week));
}

function latestSnapshot(memberId, boss) {
  const rows = state.snapshots.snapshots
    .filter(s => s.memberId === memberId && s.boss === boss)
    .sort((a, b) => (b.kc || 0) - (a.kc || 0));
  return rows[0] || null;
}

function uniqueCounts(memberId, boss) {
  const out = {};
  const snap = latestSnapshot(memberId, boss);
  if (snap && snap.uniques) Object.assign(out, snap.uniques);
  for (const ev of state.snapshots.events || []) {
    if (ev.memberId !== memberId) continue;
    if (ev.boss && ev.boss !== boss) continue;
    if (ev.type && ev.type !== "drop" && ev.type !== "clog" && ev.type !== "pet") continue;
    const item = ev.item;
    if (!item) continue;
    out[item] = (out[item] || 0) + Number(ev.qty || 1);
  }
  return out;
}

function luckLabel(ratio) {
  if (ratio == null || Number.isNaN(ratio)) return { key: "onrate", text: "No data" };
  if (ratio >= 1.75) return { key: "lucky", text: "Very lucky" };
  if (ratio >= 1.25) return { key: "lucky", text: "Lucky" };
  if (ratio >= 0.75) return { key: "onrate", text: "On rate" };
  if (ratio >= 0.45) return { key: "dry", text: "Dry" };
  return { key: "vdry", text: "Very dry" };
}

function compositeLuck(memberId, boss, n) {
  const table = state.drops[boss];
  if (!table || !n) return { ratio: null, rows: [], label: luckLabel(null) };
  const counts = uniqueCounts(memberId, boss);
  const rows = [];
  const ratios = [];
  for (const u of table.uniques) {
    const k = counts[u.item];
    const has = k != null && k !== "";
    const qty = has ? Number(k) : null;
    const E = n * u.p;
    const dry = Math.pow(1 - u.p, n);
    let piece = null;
    if (has && u.composite && E >= 0.25) {
      piece = qty / E;
      ratios.push(piece);
    }
    rows.push({ ...u, qty, E, dry, piece });
  }
  let ratio = null;
  if (ratios.length) {
    ratio = Math.exp(ratios.reduce((a, b) => a + Math.log(Math.max(b, 1e-6)), 0) / ratios.length);
  }
  return { ratio, rows, label: luckLabel(ratio) };
}

function kcForLuck(memberId, boss) {
  const snap = latestSnapshot(memberId, boss);
  if (snap && snap.kc) return { n: snap.kc, source: "loot tracker" };
  const w = state.wom[memberId];
  if (w && w.hydra > 0) return { n: w.hydra, source: "WOM" };
  return { n: 0, source: "—" };
}

async function fetchWom(member) {
  const name = encodeURIComponent(member.rsn);
  const headers = { "Accept": "application/json" };
  try { await fetch(`${WOM}/players/${name}`, { method: "POST", headers }).catch(() => {}); } catch (e) {}
  const [player, gained] = await Promise.all([
    fetch(`${WOM}/players/${name}`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${WOM}/players/${name}/gained?period=week`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  const bosses = (((player || {}).latestSnapshot || {}).data || {}).bosses || {};
  const hydra = (bosses.alchemical_hydra || {}).kills;
  const weekBosses = ((gained || {}).data || {}).bosses || {};
  const week = ((weekBosses.alchemical_hydra || {}).kills || {}).gained;
  const skills = (((player || {}).latestSnapshot || {}).data || {}).skills || {};
  state.wom[member.id] = {
    displayName: (player || {}).displayName || member.display,
    type: (player || {}).type,
    hydra: hydra > 0 ? hydra : 0,
    weekHydra: week || 0,
    totalLevel: (skills.overall || {}).level,
    updatedAt: (player || {}).updatedAt,
    ok: !!player,
  };
}

function weekKc(memberId, boss) {
  const key = memberId + ":" + boss;
  if (state.week[key] != null && state.week[key] !== "") return { n: Number(state.week[key]), source: "manual" };
  const w = state.wom[memberId];
  if (w && w.weekHydra) return { n: w.weekHydra, source: "WOM" };
  return { n: 0, source: "WOM" };
}

function nav(active) {
  return `<header class="top">
    <div class="brand">klopikkon.com<br><b>No mistakes</b></div>
    <nav class="sub">
      <a href="#/" class="${active === "home" ? "on" : ""}">Group</a>
      <a href="#/boss/alchemical-hydra" class="${active === "boss" ? "on" : ""}">Hydra</a>
      <a href="#/upload" class="${active === "upload" ? "on" : ""}">Upload</a>
      <a href="#/setup" class="${active === "setup" ? "on" : ""}">Setup</a>
    </nav>
  </header>`;
}

function renderHome() {
  const app = $("#app");
  let weekTotal = 0, lifeTotal = 0;
  const cards = state.group.members.map(m => {
    const w = state.wom[m.id] || {};
    const luckKc = kcForLuck(m.id, state.boss);
    const week = weekKc(m.id, state.boss);
    weekTotal += week.n || 0;
    lifeTotal += luckKc.n || 0;
    const luck = compositeLuck(m.id, state.boss, luckKc.n);
    const snap = latestSnapshot(m.id, state.boss);
    const plugin = (state.snapshots.events || []).some(e => e.memberId === m.id) ? "live" : (snap ? "stale" : "missing");
    const logged = Object.keys(uniqueCounts(m.id, state.boss)).length;
    return `<a class="card" href="#/m/${esc(m.id)}">
      <div class="row">
        <span class="badge">${esc(m.rsn)}</span>
        <span class="badge ${plugin}">${plugin}</span>
        <span class="badge ${luck.label.key}">${esc(luck.label.text)}</span>
      </div>
      <div class="big">${esc(w.displayName || m.display)}</div>
      <div class="row">
        <div class="kpi"><span class="label">This week</span><b>${fmt(week.n)}</b><span class="muted">${esc(week.source)}</span></div>
        <div class="kpi"><span class="label">Luck KC</span><b>${fmt(luckKc.n)}</b><span class="muted">${esc(luckKc.source)}</span></div>
        <div class="kpi"><span class="label">WOM KC</span><b>${w.ok ? fmt(w.hydra) : "—"}</b><span class="muted">hiscores</span></div>
        <div class="kpi"><span class="label">Loot GP</span><b>${snap ? fmtGp(snap.gp) : "—"}</b><span class="muted">${snap ? "panel" : "no snap"}</span></div>
      </div>
      <p class="note" style="margin:.7rem 0 0">Total ${w.totalLevel ? "lvl " + w.totalLevel : "—"} · ${logged} unique types logged</p>
    </a>`;
  }).join("");

  app.innerHTML = `${nav("home")}
    <h1>Group Ironman · No mistakes</h1>
    <p class="lede">Five accounts. Weekly Hydra KC from Wise Old Man. Luck uses loot-tracker / DropTracker KC — not mixed with a stale hiscores snapshot.</p>
    <div class="totals">
      <div class="card"><div class="label">Week Hydra KC</div><div class="big">${fmt(weekTotal)}</div></div>
      <div class="card"><div class="label">Tracked luck KC</div><div class="big">${fmt(lifeTotal)}</div></div>
      <div class="card"><div class="label">Week starts</div><div class="big">Mon 00:00</div><div class="muted">Australia/Sydney</div></div>
    </div>
    <div class="grid members">${cards}</div>
    <p class="note">WOM Hydra this week is 0 until each account is updated on WOM after kills. Use Upload to set a manual week KC.</p>
    <footer class="tiny">Drop rates cached from the <a href="https://oldschool.runescape.wiki/w/Alchemical_Hydra">OSRS Wiki</a> (CC BY-NC-SA). Pages do not hit the wiki on load.</footer>`;
}

function renderMember(id) {
  const m = findMember(id);
  const app = $("#app");
  if (!m) { app.innerHTML = nav("home") + "<p>Unknown member.</p>"; return; }
  const w = state.wom[m.id] || {};
  const luckKc = kcForLuck(m.id, state.boss);
  const week = weekKc(m.id, state.boss);
  const luck = compositeLuck(m.id, state.boss, luckKc.n);
  const snap = latestSnapshot(m.id, state.boss);
  const rows = luck.rows.map(r => {
    const qty = r.qty == null ? "—" : fmt(r.qty);
    const exp = luckKc.n ? r.E.toFixed(2) : "—";
    const obs = r.qty > 0 && luckKc.n ? "1/" + Math.round(luckKc.n / r.qty) : (r.qty === 0 ? "none" : "—");
    return `<tr>
      <td>${esc(r.item)}</td>
      <td>${qty}</td>
      <td>${esc(r.rate)}</td>
      <td title="n × p">${exp}</td>
      <td>${obs}</td>
      <td class="muted">${r.qty === 0 && luckKc.n ? ((r.dry * 100).toFixed(1) + "% still dry") : (r.piece != null ? r.piece.toFixed(2) + "×" : "—")}</td>
    </tr>`;
  }).join("");

  app.innerHTML = `${nav("home")}
    <p class="muted"><a href="#/">← Group</a></p>
    <h1>${esc(m.rsn)}</h1>
    <p class="lede">GIM · WOM type ${esc(w.type || "—")} (GIM hiscores often show as regular). Last WOM update ${w.updatedAt ? new Date(w.updatedAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }) : "—"}.</p>
    <div class="row" style="margin-bottom:1rem">
      <div class="kpi"><span class="label">Week KC</span><b>${fmt(week.n)}</b><span class="muted">${esc(week.source)}</span></div>
      <div class="kpi"><span class="label">Luck KC</span><b>${fmt(luckKc.n)}</b><span class="muted">${esc(luckKc.source)}</span></div>
      <div class="kpi"><span class="label">WOM KC</span><b>${fmt(w.hydra)}</b><span class="muted">hiscores</span></div>
      <div class="kpi"><span class="label">Panel GP</span><b>${snap ? fmtGp(snap.gp) : "—"}</b></div>
      <span class="badge ${luck.label.key}">${esc(luck.label.text)}</span>
    </div>
    ${luckKc.source === "loot tracker" && w.hydra && w.hydra !== luckKc.n ? `<p class="warn">WOM has ${fmt(w.hydra)} Hydra KC; loot tracker has ${fmt(luckKc.n)}. Luck uses the loot tracker number.</p>` : ""}
    <div class="card" style="overflow:auto">
      <div class="label">Alchemical Hydra uniques</div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Wiki</th><th>Expected</th><th>Observed</th><th>Note</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">No unique counts yet. <a href="#/upload">Upload</a>.</td></tr>`}</tbody>
      </table>
    </div>
    <p class="note" style="margin-top:1rem">${esc(((state.drops[state.boss] || {}).notes || [])[0] || "")}</p>`;
}

function renderBoss() {
  const app = $("#app");
  const table = state.drops[state.boss];
  const body = state.group.members.map(m => {
    const luckKc = kcForLuck(m.id, state.boss);
    const week = weekKc(m.id, state.boss);
    const luck = compositeLuck(m.id, state.boss, luckKc.n);
    return `<tr>
      <td><a href="#/m/${esc(m.id)}">${esc(m.rsn)}</a></td>
      <td>${fmt(week.n)}</td>
      <td>${fmt(luckKc.n)} <span class="muted">${esc(luckKc.source)}</span></td>
      <td><span class="badge ${luck.label.key}">${esc(luck.label.text)}</span></td>
    </tr>`;
  }).join("");
  const rates = (table.uniques || []).map(u =>
    `<tr><td>${esc(u.item)}</td><td>${esc(u.rate)}</td><td class="muted">${u.composite === false ? "excluded from composite" : "in composite if E ≥ 0.25"}</td></tr>`
  ).join("");

  app.innerHTML = `${nav("boss")}
    <h1>Alchemical Hydra</h1>
    <p class="lede">Cached ${esc(table.fetchedAt.slice(0, 10))}. Source: OSRS Wiki. Reloading this page does not call the wiki.</p>
    <div class="card" style="overflow:auto;margin-bottom:1rem">
      <table>
        <thead><tr><th>Member</th><th>Week KC</th><th>Luck KC</th><th>Luck</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="card" style="overflow:auto">
      <div class="label">Cached unique rates</div>
      <table>
        <thead><tr><th>Item</th><th>Rate</th><th></th></tr></thead>
        <tbody>${rates}</tbody>
      </table>
    </div>
    <ul class="note">${(table.notes || []).map(n => `<li>${esc(n)}</li>`).join("")}</ul>
    <p class="note"><a href="https://oldschool.runescape.wiki/w/Alchemical_Hydra">Wiki page</a> · <a href="https://www.droptracker.io/">DropTracker</a></p>`;
}

function renderSetup() {
  $("#app").innerHTML = `${nav("setup")}
    <h1>DropTracker + WOM setup</h1>
    <p class="lede">Live uniques come from the RuneLite DropTracker plugin (API on). Weekly KC comes from Wise Old Man.</p>
    <div class="card">
      <div class="label">Each of the five</div>
      <ol class="setup">
        <li>RuneLite → Plugin Hub → install <b>DropTracker</b>.</li>
        <li>Enable the plugin.</li>
        <li>Config → <b>API Configuration</b> → <b>Use API Connections</b>.</li>
        <li>Track Drops, Collection log, Pets. Keep unique screenshots on.</li>
        <li>Play. A Hydra unique or clog slot should mark the member <span class="badge live">live</span> after we ingest it.</li>
      </ol>
      <p class="note">Until a Cloudflare ingest URL exists, paste a DropTracker-style JSON event on <a href="#/upload">Upload</a> or use loot-tracker counts as backfill.</p>
    </div>
    <div class="card" style="margin-top:.8rem">
      <div class="label">RSNs to claim</div>
      <p>${state.group.members.map(m => `<span class="badge">${esc(m.rsn)}</span>`).join(" ")}</p>
      <p class="note">Create a DropTracker group named <b>No mistakes</b> and add these five.</p>
    </div>`;
}

function renderUpload() {
  const members = state.group.members.map(m => `<option value="${esc(m.id)}">${esc(m.rsn)}</option>`).join("");
  const table = state.drops[state.boss];
  const uniqFields = table.uniques.map(u =>
    `<label>${esc(u.item)}<input type="number" min="0" step="1" name="${esc(u.item)}" placeholder="qty"></label>`
  ).join("");

  $("#app").innerHTML = `${nav("upload")}
    <h1>Backfill snapshot</h1>
    <p class="lede">Counts from a RuneLite loot tracker panel. Stored in this browser; Export JSON to keep a copy.</p>
    <form class="stack" id="snap-form">
      <label>Member<select name="memberId">${members}</select></label>
      <label>Boss<select name="boss"><option value="alchemical-hydra">Alchemical Hydra</option></select></label>
      <label>Lifetime KC on the panel<input name="kc" type="number" min="0" required placeholder="1029"></label>
      <label>Panel GP (optional)<input name="gp" type="number" min="0" placeholder="127100000"></label>
      <label>Manual week KC (optional)<input name="weekKc" type="number" min="0" placeholder="200"></label>
      <label>Note<input name="note" placeholder="loot tracker 29 Sep"></label>
      <div class="card"><div class="label">Uniques on that panel</div>
        <div class="grid uniques" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-top:.6rem">${uniqFields}</div>
      </div>
      <div class="actions">
        <button type="submit">Save snapshot</button>
        <button type="button" class="secondary" id="export-btn">Export JSON</button>
      </div>
      <p class="note" id="snap-msg"></p>
    </form>
    <form class="stack" id="evt-form" style="margin-top:1.4rem">
      <div class="label">DropTracker-style event (JSON)</div>
      <textarea name="raw" rows="7" placeholder='{"player":"Klopikkon","type":"drop","npc":"Alchemical Hydra","item":"Hydra claw","qty":1}'></textarea>
      <button type="submit">Ingest event</button>
      <p class="note" id="evt-msg"></p>
    </form>`;

  $("#snap-form").addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const memberId = fd.get("memberId");
    const boss = fd.get("boss");
    const uniques = {};
    for (const u of table.uniques) {
      const v = fd.get(u.item);
      if (v !== "" && v != null) uniques[u.item] = Number(v);
    }
    state.snapshots.snapshots.push({
      id: memberId + "-" + boss + "-" + fd.get("kc") + "-" + Date.now(),
      memberId, boss, source: "loot_tracker",
      kc: Number(fd.get("kc")),
      gp: fd.get("gp") ? Number(fd.get("gp")) : null,
      takenAt: new Date().toISOString().slice(0, 10),
      note: fd.get("note") || "",
      uniques,
    });
    const wk = fd.get("weekKc");
    if (wk !== "" && wk != null) state.week[memberId + ":" + boss] = Number(wk);
    saveLocal();
    $("#snap-msg").textContent = "Saved in this browser. Open the member page to see luck.";
  });

  $("#evt-form").addEventListener("submit", e => {
    e.preventDefault();
    try {
      const ev = JSON.parse(new FormData(e.target).get("raw"));
      const player = ev.player || ev.rsn || ev.player_name;
      const m = findMember(player);
      if (!m) throw new Error("Unknown player " + player);
      const item = ev.item || ev.itemName;
      const npc = ev.npc || ev.source || ev.boss || "Alchemical Hydra";
      state.snapshots.events.push({
        type: ev.type || "drop",
        memberId: m.id,
        boss: /hydra/i.test(String(npc)) ? "alchemical-hydra" : state.boss,
        item, qty: Number(ev.qty || ev.quantity || 1),
        at: ev.at || new Date().toISOString(),
        raw: ev,
      });
      saveLocal();
      $("#evt-msg").textContent = "Ingested " + item + " for " + m.rsn;
    } catch (err) {
      $("#evt-msg").textContent = String(err.message || err);
    }
  });

  $("#export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({
      snapshots: state.snapshots.snapshots,
      events: state.snapshots.events,
      week: state.week,
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "no-mistakes-local.json";
    a.click();
  });
}

function render() {
  const { parts } = route();
  if (parts[0] === "m" && parts[1]) return renderMember(parts[1]);
  if (parts[0] === "boss") return renderBoss();
  if (parts[0] === "setup") return renderSetup();
  if (parts[0] === "upload") return renderUpload();
  return renderHome();
}

async function boot() {
  const app = $("#app");
  app.innerHTML = "<p class='muted'>Loading No mistakes…</p>";
  try {
    const [group, hydra, snaps] = await Promise.all([
      loadJSON("data/group.json"),
      loadJSON("data/drops/alchemical-hydra.json"),
      loadJSON("data/snapshots.json"),
    ]);
    state.group = group;
    state.drops["alchemical-hydra"] = hydra;
    state.snapshots = snaps;
    loadLocal();
    render();
    await Promise.all(group.members.map(m => fetchWom(m).catch(() => {})));
    render();
  } catch (e) {
    app.innerHTML = `<p class="err">${esc(e.message || e)}</p>`;
  }
}

window.addEventListener("hashchange", render);
boot();
