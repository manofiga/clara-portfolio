// @ts-check
// popup.js — Dashboard landing, Report tab with AI Score + PNG export, tabs at top, footer controls.
// Adds: AI Score info modal, Reset Today confirm dialog, context-menu tip persistence, safer rule help text.

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/** @param {any} x @returns {x is Element} */
function isElement(x) {
  return x instanceof Element;
}
/** type-narrowing helper so .style is safe */
function isEl(x) { return x instanceof HTMLElement; }
/** type-narrowing helper for inputs/selects/textarea so .value is safe */
function isFormInput(x) {
  return x instanceof HTMLInputElement || x instanceof HTMLTextAreaElement || x instanceof HTMLSelectElement;
}

/* ---------------- Tabs ---------------- */
function closeAllTabs() {
  $$(".tab-page").forEach(p => { if (isEl(p)) p.style.display = "none"; });
  $$("#tabs button[data-tab]").forEach(b => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  const tb = $("#tabsBack"); if (isEl(tb)) tb.style.display = "none";
  const dash = $("#dashboardSection");
  if (isEl(dash)) {
    dash.style.display = "block";
    // ✅ when dashboard becomes visible again, resize + redraw charts
    refreshDashboard();
  }
}
function openTab(id) {
  $$(".tab-page").forEach(p => { if (isEl(p)) p.style.display = (p.id === `tab-${id}`) ? "block" : "none"; });
  $$("#tabs button[data-tab]").forEach(b => {
    const active = b.dataset.tab === id;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  const dash2 = $("#dashboardSection"); if (isEl(dash2)) dash2.style.display = "none";
  const tb2 = $("#tabsBack"); if (isEl(tb2)) tb2.style.display = "inline-block";
  if (id === "report") refreshReport(); // ensure fresh render on open
}
document.addEventListener("click", (e) => {
  const el = e.target;
  if (!isElement(el)) return; // not a DOM element, ignore

  const btn = el.closest("button[data-tab]");
  if (!btn) return;

  const id = /** @type {HTMLButtonElement} */ (btn).dataset.tab;
  if (id) openTab(id);
});
$("#tabsBack")?.addEventListener("click", closeAllTabs);
closeAllTabs();

/* Keyboard shortcuts (1..4, Esc) */
document.addEventListener("keydown", (e) => {
  const tgt = e.target;
  if (!isElement(tgt)) return;

  // Don't hijack typing in inputs
  const tag = tgt.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  if (e.key === "Escape") {
    closeAllTabs();
  }
  // Cmd/Ctrl+L → open Logs (example)
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
    openTab("logs");
    e.preventDefault();
  }
});

/* -------- Friendly labels for exports -------- */
const FRIENDLY = {
  version: "Schema version",
  alias: "User name / tag",
  consent: "Data sharing consent",
  week_start: "Week begins",
  week_end: "Week ends",
  totals: "Total usage",
  "totals.minutes": "Total minutes this week",
  "totals.by_domain": "Minutes by site",
  score: "AI Score",
  most_active_day: "Most active day",
  "most_active_day.iso": "Date",
  "most_active_day.minutes": "Minutes",
  change_vs_prev_week_pct: "Change vs last week (%)",
  streak_weeks: "Streak (weeks active)",
  badge: "User type",
  provenance: "Technical details",
  "provenance.created_at": "Export created",
  "provenance.device_local_only": "Stored only on this device",
  "provenance.extension_version": "Extension version",
  weekly_breakdown: "Daily usage (minutes)",
};

/* ---------------- Helpers ---------------- */
function fmtShort(sec){ sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
  if (h) return `${h}h ${m}m`; if (m) return `${m}m`; return `${sec}s`; }
function fmtDuration(sec){ sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  if (h) return `${h}h ${m}m ${s}s`; if (m) return `${m}m ${s}s`; return `${s}s`; }
function startOfDay(ts=Date.now()){ const d=new Date(ts); d.setHours(0,0,0,0); return +d; }
function startOfWeek(ts=Date.now()){ const d=new Date(ts); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return +d; }
function endOfWeek(ts=Date.now()){ return startOfWeek(ts) + 7*86400000 - 1; }
function sumInRange(logs, active, start, end){
  let sum=0, now=Date.now();
  for (const l of logs){ const s=Math.max(l.start,start), e=Math.min(l.end,end); if (e>s) sum+=(e-s)/1000; }
  if (active?.start && active?.domain){ const s=Math.max(active.start,start), e=Math.min(now,end); if (e>s) sum+=(e-s)/1000; }
  return Math.floor(sum);
}
function friendly(key, fallback = "") {
  return FRIENDLY[key] || fallback || key;
}
function setTitle(qs, text) {
  const el = document.querySelector(qs);
  if (el) el.setAttribute("title", text);
}
// ---- Pilot pages links (Drop C) ----
function wirePilotLinks() {
  const open = (relPath) => {
    try {
      const url = chrome.runtime.getURL(relPath);
      // open in a new tab (keeps popup clean)
      chrome.tabs.create({ url });
    } catch (e) {
      console.warn('Could not open page', relPath, e);
      // graceful fallback inside popup (rarely used)
      window.open(chrome.runtime.getURL(relPath), '_blank');
    }
  };
  const s = document.getElementById('btnOpenStudent');
  const t = document.getElementById('btnOpenTeacher');
  if (s) s.addEventListener('click', () => open('pages/student.html'));
  if (t) t.addEventListener('click', () => open('pages/teacher.html'));
}
function domainFromUrl(u){ try { return new URL(u).host; } catch { return ""; } }
function urlMatchesRules(url, rules){
  // Mirrors background.js logic
  const host = domainFromUrl(url).toLowerCase();
  const full = (url||"").toLowerCase();
  return (rules||[]).some(r=>{
    const rule = String(r||"").trim().toLowerCase();
    if (!rule) return false;
    if (/^[a-z0-9.-]+$/.test(rule)) {
      return host === rule || host.endsWith("." + rule);
    } else {
      const token = rule.replace(/^\*+/, "");
      return token && full.includes(token);
    }
  });
}
function weekdayNamesFromNow(){
  const names=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], now=new Date(), out=[];
  for (let i=6;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i); out.push(names[(d.getDay()+6)%7]); }
  return out;
}
function weekdayNamesFromWeekStart(weekStart){
  const names=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], out=[];
  for (let i=0;i<7;i++){ const d=new Date(weekStart + i*86400000); out.push(names[(d.getDay()+6)%7]); }
  return out;
}
function setTextWithPulse(el,text){
  if (!el) return;
  if (el.textContent !== text){ el.textContent = text; el.classList.add("pulse"); setTimeout(()=>el.classList.remove("pulse"), 200); }
}
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

/* ---------------- State ---------------- */
let cached = { trackingEnabled:true, rules:[], logs:[], active:null, pausedUntil:0, badgeMode:"minutes" };
let liveTicker = null;

/* ---------------- Theme ---------------- */
const themeSelect = $("#themeSelect");
let _themePref = "system";
const mqDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");

(async function initTheme(){
  const { themePref="system" } = await chrome.storage.local.get("themePref");
  _themePref = themePref;
  document.documentElement.setAttribute("data-theme", themePref);
  const prefersDark = mqDark && mqDark.matches;
  document.body.setAttribute("data-color-scheme", themePref === "system" ? (prefersDark ? "dark" : "light") : themePref);
  if (isFormInput(themeSelect)) themeSelect.value = themePref;
  try { localStorage.setItem('aiu-themePref', themePref); } catch {}
})();
themeSelect?.addEventListener("change", async ()=>{
  if (!isFormInput(themeSelect)) return;
  const v = themeSelect.value;
  _themePref = v;
  document.documentElement.setAttribute("data-theme", v);
  await chrome.storage.local.set({ themePref:v });
  try { localStorage.setItem('aiu-themePref', v); } catch {}
  document.body.setAttribute("data-color-scheme", v==="system" ? ((mqDark && mqDark.matches) ? "dark":"light") : v);
  // theme change may affect chart colors -> redraw
  refreshDashboard();
  refreshReport();
});
if (mqDark && mqDark.addEventListener) {
  mqDark.addEventListener("change", (e)=>{
    if (_themePref === "system") {
      document.body.setAttribute("data-color-scheme", e.matches ? "dark" : "light");
      refreshDashboard();
      refreshReport();
    }
  });
}

/* ---------------- Messaging helpers ---------------- */
async function getState(){ return await chrome.runtime.sendMessage({ type:"GET_STATE" }); }
async function pauseFor(mins){ await chrome.runtime.sendMessage({ type:"PAUSE_FOR", minutes:mins }); renderHeader(); }
async function resumeAll(){ await chrome.runtime.sendMessage({ type:"RESUME" }); renderHeader(); }
async function setUiFlags(flags){ await chrome.runtime.sendMessage({ type:"SET_STORAGE_FLAGS", flags }); }
async function getUiFlags(){ const res = await chrome.runtime.sendMessage({ type:"GET_STORAGE_FLAGS" }); return res?.uiFlags || {}; }

/* ---------------- Header (status + hints) ---------------- */
async function renderHeader(){
  const state = await getState(); cached = state;

  const ls = $("#liveStatus");
  const header = $("#header");
  clearInterval(liveTicker);

  const paused = Date.now() < (state.pausedUntil || 0);
  if (isEl(header)) {
    if (paused) header.classList.add("paused");
    else header.classList.remove("paused");
  }

  if (paused) {
    const until = new Date(state.pausedUntil);
    const t = until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (ls) ls.textContent = `Paused until ${t}`;
  } else {
    if (state.active?.domain){
      const start = state.active.start, domain = state.active.domain;
      const tick = ()=>{ const sec=Math.floor((Date.now()-start)/1000); if (ls) ls.textContent=`Tracking: ${domain} • ${fmtDuration(sec)}`; };
      tick(); liveTicker = setInterval(tick, 1000);
    } else {
      if (ls) ls.textContent = "Tracking: —";
    }
  }

  // Quick add when current tab not tracked
  const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
  const currentUrl = tab?.url || "";
  const isTracked = urlMatchesRules(currentUrl, state.rules);
  if (currentUrl && !isTracked){
    const hintText = $("#hintText"); if (hintText) hintText.textContent = "Not tracking this site.";
    const contextHint = $("#contextHint"); if (isEl(contextHint)) contextHint.style.display = "flex";
    const addBtn = $("#addRuleFromHere");
    if (isEl(addBtn)) addBtn.onclick = async ()=>{
      const d = domainFromUrl(currentUrl); if (!d) return;
      await chrome.runtime.sendMessage({ type:"ADD_RULE", value:d });
      await renderRules();
      const ch = $("#contextHint"); if (isEl(ch)) ch.style.display = "none";
    };
  } else {
    const ch = $("#contextHint"); if (isEl(ch)) ch.style.display = "none";
  }

  // Multi-tab hint
  const tabs = await chrome.tabs.query({ currentWindow:true });
  const aiTabs = tabs.filter(t => t.url && urlMatchesRules(t.url, state.rules));
  const mt = $("#multiTabHint"); if (isEl(mt)) mt.style.display = aiTabs.length > 1 ? "flex" : "none";

  // Footer controls
  const p15 = $("#pause15"); if (isEl(p15)) p15.onclick = () => pauseFor(15);
  const p60 = $("#pause60"); if (isEl(p60)) p60.onclick = () => pauseFor(60);
  const pToday = $("#pauseToday"); if (isEl(pToday)) pToday.onclick = async ()=>{
    const now = Date.now(); const end = new Date(); end.setHours(23,59,59,999);
    const mins = Math.max(1, Math.floor((+end - now)/60000));
    await pauseFor(mins);
  };
  const resume = $("#resumeBtn"); if (isEl(resume)) resume.onclick = resumeAll;
  const reset = $("#resetTodayBtn"); if (isEl(reset)) reset.onclick = async ()=>{
    const ok = confirm("Reset today’s tracked time?\n\nThis ends the active session and clears today’s logs. This cannot be undone.");
    if (!ok) return;
    await chrome.runtime.sendMessage({ type:"RESET_TODAY" });
    await refreshDashboard();
    await refreshLogs(true);
    await refreshReport();
  };
}

/* ---------------- Fluid Canvas helpers ---------------- */
function sizeCanvas(canvas){
  if (!(canvas instanceof HTMLCanvasElement)) return /** @type {CanvasRenderingContext2D} */(null);
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const needW = Math.floor(rect.width * dpr);
  const needH = Math.floor(rect.height * dpr);
  if (canvas.width !== needW)  canvas.width  = needW;
  if (canvas.height !== needH) canvas.height = needH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return /** @type {CanvasRenderingContext2D} */(null);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);
  return ctx;
}

/* ---------------- Charts ---------------- */
function drawSpark(ctx, points){
  if (!ctx) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = ctx.canvas.width / dpr;
  const h = ctx.canvas.height / dpr;

  ctx.clearRect(0,0,w,h);
  if (!points.length) return;

  const pad = 10;
  const max = Math.max(...points,1);

  ctx.lineWidth = 2;
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--chart-line").trim() || "#5b82ff";
  ctx.beginPath();
  points.forEach((v,i)=>{
    const x = pad + (i*(w-2*pad)/(points.length-1));
    const y = h - pad - (v/max)*(h-2*pad);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

function drawBarsWithWeekdays(ctx, points, labels){
  if (!ctx) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = ctx.canvas.width / dpr;
  const h = ctx.canvas.height / dpr;

  ctx.clearRect(0,0,w,h);
  if (!points.length) return;

  const padTop=8, padBottom=22, padSides=8, max=Math.max(...points,1);
  const count=points.length, innerW=w-padSides*2, slotW=innerW/count, barW=Math.min(22, slotW*0.6), xStart=padSides+(slotW-barW)/2;

  const fill=getComputedStyle(document.body).getPropertyValue("--chart-bar").trim()||"#9bb3ff";
  const text=getComputedStyle(document.body).getPropertyValue("--ink-muted").trim()||"#6b7280";

  ctx.fillStyle = fill;
  points.forEach((sec,i)=>{
    const bh = ((sec/max) * (h - padTop - padBottom));
    const x = xStart + i*slotW;
    const y = h - padBottom - bh;
    ctx.fillRect(x, y, barW, bh);
  });

  ctx.font = "11px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = text;
  points.forEach((_s,i)=>{
    const cx = xStart + i*slotW + barW/2;
    ctx.fillText(labels[i]||"", cx, h-16);
  });

  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--line").trim() || "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padSides, h - padBottom);
  ctx.lineTo(w - padSides, h - padBottom);
  ctx.stroke();
}

/* ---------------- Dashboard ---------------- */
async function refreshDashboard(){
  const { logs=[], active } = await getState();
  cached.logs = logs; cached.active = active;
  const now=Date.now(), sod=startOfDay(now), sow=startOfWeek(now);

  setTextWithPulse($("#todayCount"), fmtShort(sumInRange(logs, active, sod, now)));
  setTextWithPulse($("#weekCount"),  fmtShort(sumInRange(logs, active, sow, now)));
  setTextWithPulse($("#totalCount"), fmtShort(sumInRange(logs, active, 0,   now)));

  // Build last 7 days (includes today)
  const daySecs=[];
  for(let i=6;i>=0;i--){
    const end=startOfDay(now)-(6-i)*86400000+86400000;
    const start=end-86400000;
    daySecs.push(sumInRange(logs, null, start, end));
  }

  // Size canvases and draw
  const sparkCtx = sizeCanvas($("#spark"));
  drawSpark(sparkCtx, daySecs);

  const barCtx = sizeCanvas($("#bar7"));
  drawBarsWithWeekdays(barCtx, daySecs, weekdayNamesFromNow());

  // Avg/day label
  const avg = Math.floor(daySecs.reduce((a,b)=>a+b,0) / (daySecs.length || 1));
  setTextWithPulse($("#avg7"), fmtShort(avg));
}
window.addEventListener("resize", () => { refreshDashboard(); refreshReport(); });

/* ---------------- Report: data + score + chart + export ---------------- */
function computeWeekAggregates(state){
  const logs = state.logs || [];
  const active = state.active || null;
  const weekStart = startOfWeek(Date.now());
  const weekEnd = endOfWeek(Date.now());

  // per-day seconds this week (Mon..Sun)
  const perDay = [];
  for (let i=0;i<7;i++){
    const dayStart = weekStart + i*86400000;
    const dayEnd   = dayStart + 86400000;
    perDay.push(sumInRange(logs, active, dayStart, dayEnd));
  }

  // per-domain seconds
  const perDomain = new Map();
  function addDomain(domain, seconds){
    if (!domain || seconds<=0) return;
    perDomain.set(domain, (perDomain.get(domain)||0) + seconds);
  }
  for (const l of logs){
    const s = Math.max(l.start, weekStart);
    const e = Math.min(l.end,   weekEnd);
    if (e > s) addDomain(l.domain, Math.floor((e-s)/1000));
  }
  if (active?.start && active?.domain){
    const now = Date.now();
    const s = Math.max(active.start, weekStart);
    const e = Math.min(now, weekEnd);
    if (e > s) addDomain(active.domain, Math.floor((e-s)/1000));
  }

  let topDomain = "—", topSec = 0;
  for (const [d,sec] of perDomain.entries()){
    if (sec > topSec){ topSec = sec; topDomain = d; }
  }

  const totalWeekSec = perDay.reduce((a,b)=>a+b,0);

  return { weekStart, weekEnd, perDay, totalWeekSec, topDomain, topSec };
}

function calcAiScore(hours){
  if (hours < 5)  return 100;
  if (hours <= 15) return Math.round(80 - (hours - 5) * 2);   // 5h→80, 15h→60
  if (hours <= 20) return Math.round(60 - (hours - 15) * 2);  // 15h→60, 20h→50
  return clamp(Math.round(50 - (hours - 20) * 2), 20, 100);   // drop by 2/h beyond 20, floor 20
}
function scoreBand(score){
  if (score >= 80) return "text-ok";
  if (score >= 50) return "text-warn";
  return "text-danger";
}

function renderReportRange(weekStart, weekEnd){
  const f = (ts)=> new Date(ts).toLocaleDateString([], { month:"short", day:"numeric" });
  const el = $("#reportRange"); if (el) el.textContent = `${f(weekStart)} – ${f(weekEnd)}`;
}

function renderReportStats(agg){
  setTextWithPulse($("#reportTotal"), fmtShort(agg.totalWeekSec));
  setTextWithPulse($("#reportTop"),   agg.topDomain || "—");

  const hrs = agg.totalWeekSec / 3600;
  const score = calcAiScore(hrs);
  const scoreEl = $("#reportScore");
  if (scoreEl) {
    scoreEl.textContent = String(score);
    scoreEl.classList.remove("text-ok","text-warn","text-danger");
    scoreEl.classList.add(scoreBand(score));
  }
}

function applyFriendlyTitlesForReport() {
  // stat number cells
  setTitle("#reportTotal", friendly("report.total", "Total this week"));
  setTitle("#reportTop",   friendly("report.top",   "Top AI tool this week"));
  setTitle("#reportScore", friendly("report.score", "AI Score for this week"));

  // export buttons
  setTitle("#exportReportBtn",      friendly("btn.export.report"));
  setTitle("#exportPortfolioBtn",   friendly("btn.export.portfolio"));
  setTitle("#exportWeeklyBtn",      friendly("btn.export.portfolioWeekly"));
  setTitle("#exportAttachmentBtn",  friendly("btn.export.attachment"));
  setTitle("#exportAnalyticsBtn",   friendly("btn.export.analytics"));
}

function renderReportChart(perDay, weekStart){
  const ctx = sizeCanvas($("#reportBar"));
  drawBarsWithWeekdays(ctx, perDay, weekdayNamesFromWeekStart(weekStart));
}

async function refreshReport(){
  const state = await getState(); cached = state;
  const agg = computeWeekAggregates(state);
  renderReportRange(agg.weekStart, agg.weekEnd);
  renderReportStats(agg);
  renderReportChart(agg.perDay, agg.weekStart);
  applyFriendlyTitlesForReport();
}

/* ---- Export PNG ---- */
function drawRoundedRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
}
function exportReportPNG(agg){
  // ---- CSS palette ----
  const css   = getComputedStyle(document.body);
  const bg    = css.getPropertyValue("--bg").trim() || "#0b1220";
  const ink   = css.getPropertyValue("--ink").trim() || "#e5e7eb";
  const muted = css.getPropertyValue("--ink-muted").trim() || "#9ca3af";
  const line  = css.getPropertyValue("--line").trim() || "rgba(148,163,184,0.28)";
  const card  = css.getPropertyValue("--card").trim() || "#111827";
  const bar   = css.getPropertyValue("--chart-bar").trim() || "#9bb3ff";
  const brand = css.getPropertyValue("--brand").trim() || "#3a7afe";

  // ---- Canvas ----
  const W = 900, H = 520, P = 20, r = 14;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";

  // helpers
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
  const fISO  = (ts)=> new Date(ts).toISOString().slice(0,10);
  const fRange = (s,e)=> {
    const o = (ts)=> new Date(ts).toLocaleDateString([], { month:"short", day:"numeric" });
    return `${o(s)} – ${o(e)}`;
  };
  const fmtM  = (m)=> `${Math.round(m)}m`;
  const fmtS  = (s)=> fmtM(s/60);
  const measure = (txt, font)=>{ ctx.save(); ctx.font = font; const w = ctx.measureText(txt).width; ctx.restore(); return w; };

  // ---- Data mapping (adapt if your agg uses different names) ----
  const weekStartTs = agg.weekStart ?? agg.week_start ?? Date.now();         // ms or ISO? supply ms here for formatting; otherwise convert
  const weekEndTs   = agg.weekEnd   ?? agg.week_end   ?? Date.now();
  const totalWeekSec = agg.totalWeekSec ?? (agg.totals?.minutes ? agg.totals.minutes*60 : 0);
  const perDaySec = Array.isArray(agg.perDay) ? agg.perDay : (agg.weekly_breakdown ? agg.weekly_breakdown.map(d=> (d.minutes||0)*60) : new Array(7).fill(0));
  const perDomainMinObj = agg.totals?.by_domain || {};
  const score = typeof agg.score === "number" ? agg.score : calcAiScore(totalWeekSec/3600);
  const badge = agg.badge || (score>=80?"Healthy":(score>=50?"Power User":"Super User"));
  const changePct = (typeof agg.change_vs_prev_week_pct === "number") ? agg.change_vs_prev_week_pct : null;
  const streak = typeof agg.streak_weeks === "number" ? agg.streak_weeks : 0;
  const alias = agg.alias || "student";
  const consent = (typeof agg.consent === "boolean" ? agg.consent : true);

  // sorted top domains
  const topDomains = Object.entries(perDomainMinObj)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,5);

  // derived
  const labels7 = weekdayNamesFromWeekStart(weekStartTs);
  const maxSec  = Math.max(...perDaySec, 60); // at least 1m scale
  const maxMin  = Math.ceil(maxSec/60);

  // ---- Background ----
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

  // ---- Card ----
  drawRoundedRect(ctx, P, P, W-2*P, H-2*P, r);
  ctx.fillStyle = card; ctx.fill();
  ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();

  // ---- Title + range ----
  ctx.fillStyle = ink;
  ctx.font = "700 22px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.fillText("Weekly AI Report Card", P+26, P+42);

  ctx.fillStyle = muted;
  ctx.font = "400 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.fillText(fRange(weekStartTs, weekEndTs), P+26, P+62);

  // ---- Stat cards (3) ----
  const boxW = (W - 2*P - 2*16 - 2*26) / 3;
  const boxH = 76;
  const boxY = P + 84;

  const statLabels = ["Total minutes this week","Top AI tool","AI Score"];
  const totalStr   = fmtS(totalWeekSec);
  const topName    = topDomains[0]?.[0] || "—";
  const statVals   = [ totalStr, topName, String(score) ];

  for (let i=0;i<3;i++){
    const x = P + 26 + i*(boxW+16);
    drawRoundedRect(ctx, x, boxY, boxW, boxH, 10);
    ctx.fillStyle = "transparent"; ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();

    ctx.fillStyle = muted; ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.fillText(statLabels[i], x+12, boxY+22);

    ctx.fillStyle = ink; ctx.font = i===1 ? "800 22px system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
                                          : "700 22px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    // clamp top tool so it never collides the right edge
    let value = statVals[i];
    const maxW = boxW - 24;
    while (measure(value, ctx.font) > maxW && value.length > 3) value = value.slice(0,-4) + "…";
    ctx.fillText(value, x+12, boxY+50);
  }

  // ---- Delta / Streak / Badge row (under stat cards) ----
  const rowY = boxY + boxH + 18;
  let cursorX = P + 26;

  // delta chip
  if (changePct !== null && isFinite(changePct)) {
    const up = changePct >= 0;
    const txt = `${up ? "▲" : "▼"} ${Math.abs(changePct).toFixed(1)}% vs last week`;
    const padX=10, padY=6; ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    const w = measure(txt, ctx.font) + padX*2, h = 24;
    drawRoundedRect(ctx, cursorX, rowY, w, h, 12);
    ctx.fillStyle = "rgba(59,130,246,0.15)"; ctx.fill();
    ctx.strokeStyle = up ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"; ctx.stroke();
    ctx.fillStyle = up ? "#22c55e" : "#ef4444";
    ctx.fillText(txt, cursorX+padX, rowY + h - 8);
    cursorX += w + 10;
  }

  // streak chip
  {
    const txt = `streak ${streak}w`;
    const padX=10, h=24; ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    const w = measure(txt, ctx.font) + padX*2;
    drawRoundedRect(ctx, cursorX, rowY, w, h, 12);
    ctx.fillStyle = "rgba(16,185,129,0.15)"; ctx.fill();
    ctx.strokeStyle = "rgba(16,185,129,0.4)"; ctx.stroke();
    ctx.fillStyle = "#10b981";
    ctx.fillText(txt, cursorX+padX, rowY + h - 8);
    cursorX += w + 10;
  }

  // badge chip
  {
    const txt = badge;
    const padX=10, h=24; ctx.font = "700 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    const w = measure(txt, ctx.font) + padX*2;
    drawRoundedRect(ctx, cursorX, rowY, w, h, 12);
    ctx.fillStyle = "rgba(99,102,241,0.15)";
    ctx.strokeStyle = "rgba(99,102,241,0.4)";
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#a5b4fc";
    ctx.fillText(txt, cursorX+padX, rowY + h - 8);
  }

  // ---- Chart area (left) + Top 5 list (right) ----
  const layoutGap = 20;
  const leftW  = Math.floor((W - 2*P - 52 - layoutGap) * 0.66);
  const rightW = (W - 2*P - 52 - layoutGap) - leftW;

  const chartX = P + 26, chartY = rowY + 34;
  const chartW = leftW,  chartH = 230;

  // gridlines + y ticks (minutes)
  ctx.strokeStyle = line; ctx.lineWidth = 1;
  const padTop = 8, padBottom = 28, padSides = 8;
  const innerH = chartH - padTop - padBottom;
  const yTicks = 4;
  ctx.fillStyle = muted; ctx.font = "400 11px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.textAlign = "right";
  for (let i=0;i<=yTicks;i++){
    const frac = i / yTicks;
    const y = chartY + padTop + (1-frac)*innerH;
    ctx.beginPath(); ctx.moveTo(chartX, y); ctx.lineTo(chartX + chartW, y); ctx.stroke();
    const label = `${Math.round(frac * maxMin)}m`;
    ctx.fillText(label, chartX - 6, y + 4);
  }

  // bars
  const points = perDaySec;
  const count  = points.length;
  const innerW = chartW - padSides*2;
  const slotW  = innerW / count;
  const barW   = Math.min(32, slotW*0.6);
  const xStart = chartX + padSides + (slotW - barW)/2;

  // most active day index
  let mostIdx = 0, mostVal = 0;
  for (let i=0;i<count;i++){ if (points[i] > mostVal){ mostVal = points[i]; mostIdx = i; } }

  ctx.fillStyle = bar;
  for (let i=0;i<count;i++){
    const sec = points[i];
    const bh = (sec / (maxMin*60)) * innerH;
    const x  = xStart + i*slotW;
    const y  = chartY + padTop + (innerH - bh);
    ctx.fillRect(x, y, barW, Math.max(1,bh));
  }

  // x labels
  ctx.fillStyle = muted; ctx.font = "400 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.textAlign = "center";
  for (let i=0;i<count;i++){
    const cx = xStart + i*slotW + barW/2;
    ctx.fillText(labels7[i], cx, chartY + chartH - 16);
  }

  // most active callout
  if (mostVal > 0){
    const x  = xStart + mostIdx*slotW + barW/2;
    const m  = Math.round(mostVal/60);
    const lbl= `${m}m`;
    ctx.fillStyle = brand;
    ctx.font = "700 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(lbl, x, chartY + padTop + 12);
  }

  // ---- Right column: Top 5 tools ----
  const listX = chartX + chartW + layoutGap;
  const listY = chartY + 4;

  ctx.fillStyle = muted;
  ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Top tools this week", listX, listY);

  let ly = listY + 18;
  const rowH = 22;
  for (let i=0;i<topDomains.length;i++){
    const [dom, mins] = topDomains[i];
    // dot
    ctx.beginPath(); ctx.arc(listX + 6, ly - 6, 3, 0, Math.PI*2); ctx.fillStyle = brand; ctx.fill();
    // domain
    ctx.fillStyle = ink; ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    let label = dom || "—";
    const maxWDom = rightW - 80;
    while (measure(label, ctx.font) > maxWDom && label.length > 3) label = label.slice(0,-4)+"…";
    ctx.fillText(label, listX + 16, ly);
    // minutes
    ctx.fillStyle = muted; ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    const mStr = `${Math.round(mins)}m`;
    const w = measure(mStr, ctx.font);
    ctx.fillText(mStr, listX + rightW - w, ly);
    ly += rowH;
  }
  if (topDomains.length === 0){
    ctx.fillStyle = muted; ctx.font = "400 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.fillText("No AI activity recorded.", listX, ly);
  }

  // ---- Brand footer ----
  ctx.fillStyle = brand; ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("C.L.A.R.A. • Local-only", P+26, H - P - 10);

  // ---- Small print (generated at, version, alias/consent) ----
  ctx.fillStyle = muted;
  ctx.font = "400 11px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  const ver = (chrome.runtime.getManifest().version || "1.x");
  const gen = new Date().toISOString().slice(0,16).replace("T"," ");
  const consentTxt = consent ? "consent: yes" : "consent: no";
  const small = `${alias} • ${consentTxt} • generated ${gen} • v${ver}`;
  const textW = ctx.measureText(small).width;
  ctx.textAlign = "left";
  ctx.fillText(small, W - P - 26 - textW, H - P - 10);

  // ---- Download ----
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0,10);
  a.download = `ai_weekly_report_${dateStr}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}
const exportBtn = $("#exportReportBtn");
if (exportBtn) exportBtn.addEventListener("click", async ()=>{
  const state = await getState();
  const agg = computeWeekAggregates(state);
  exportReportPNG(agg);
});

/* ---- Badge mode (Settings) ---- */
const badgeSelect = document.getElementById("badgeMode");

// set the current value from background state on hydrate
(async () => {
  try {
    const st = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    if (badgeSelect instanceof HTMLSelectElement && st?.badgeMode) {
      badgeSelect.value = st.badgeMode; // "minutes" | "onoff" | "none"
    }
  } catch {}
})();

// send changes to background
if (badgeSelect instanceof HTMLSelectElement) {
  badgeSelect.addEventListener("change", async () => {
    const v = badgeSelect.value; // minutes | onoff | none
    await chrome.runtime.sendMessage({ type: "SET_BADGE_MODE", value: v });
  });
}

// ---- Export Portfolio JSON ----
const exportPortfolioBtn = $("#exportPortfolioBtn");
if (exportPortfolioBtn) exportPortfolioBtn.addEventListener("click", ()=>{
  chrome.runtime.sendMessage({ type: 'EXPORT_PORTFOLIO_V01' }, ({ok, json}) => {
    if (!ok) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
});

/* ---- Export Weekly Portfolio JSON (robust ids) ---- */
const weeklyBtnNew = document.getElementById("exportWeeklyBtn");
const weeklyBtnOld = document.getElementById("exportWeekJson"); // legacy id

function doWeeklyExport() {
  chrome.runtime.sendMessage({ type: "EXPORT_PORTFOLIO_WEEKLY_V01" }, (res = {}) => {
    const { ok, json } = /** @type {{ok?:boolean,json?:string}} */(res);
    if (!ok || !json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_weekly_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

if (weeklyBtnNew instanceof HTMLElement) weeklyBtnNew.addEventListener("click", doWeeklyExport);
if (weeklyBtnOld instanceof HTMLElement) weeklyBtnOld.addEventListener("click", doWeeklyExport);

// ---- Export Attachment JSON (privacy‑minimal) ----
const exportAttachmentBtn = document.getElementById("exportAttachmentBtn");
if (exportAttachmentBtn instanceof HTMLElement) {
  exportAttachmentBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { type: "EXPORT_ATTACHMENT_V01" },
      /** @param {{ok?: boolean, json?: string}=} res */
      (res = {}) => {
        const { ok, json } = res;
        if (!ok || !json) return;
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `attachment_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    );
  });
}

// ---- Export Analytics JSON (rich dataset) ----
const exportAnalyticsBtn = document.getElementById("exportAnalyticsBtn");
if (exportAnalyticsBtn instanceof HTMLElement) {
  exportAnalyticsBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { type: "EXPORT_ANALYTICS_V01" },
      /** @param {{ok?: boolean, json?: string}=} res */
      (res = {}) => {
        const { ok, json } = res;
        if (!ok || !json) return;
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analytics_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    );
  });
}

// ---- Download JSON Backup (Settings) ----
document.getElementById('downloadJsonBtn')?.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'BACKUP_EXPORT' });
  if (!res?.ok) return alert('Backup failed.');
  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai_use_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---- Import JSON (Settings) ----
document.getElementById('importJsonBtn')?.addEventListener('click', async () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); }
    catch { alert('Invalid JSON file.'); return; }

    const res = await chrome.runtime.sendMessage({ type: 'BACKUP_IMPORT', data });
    if (!res?.ok) {
      alert('Import failed' + (res?.error ? `: ${res.error}` : '.'));
      return;
    }
    // Refresh UI after import
    await renderHeader();
    await refreshDashboard();
    await refreshLogs(true);
    await renderRules();
    await refreshReport();
    alert('Import complete.');
  };
  input.click();
});

// ---- Clear All (Settings) ----
document.getElementById('clearAllBtn')?.addEventListener('click', async () => {
  const ok = confirm('Clear all local data? This cannot be undone.');
  if (!ok) return;
  const res = await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' });
  if (!res?.ok) return alert('Could not clear data.');
  await renderHeader();
  await refreshDashboard();
  await refreshLogs(true);
  await renderRules();
  await refreshReport();
});

/* ---------------- Logs (pagination) ---------------- */
const PAGE_SIZE = 200;
let _allRows = [];
let _page = 1;

function renderLogsPage(){
  const tbody=$("#logsTable tbody");
  const start=( _page - 1 ) * PAGE_SIZE;
  const end=Math.min(_allRows.length, start+PAGE_SIZE);
  for(let i=start;i<end;i++){
    const l=_allRows[i]; const tr=document.createElement("tr");
    const dur=Math.max(0, Math.round((l.end-l.start)/1000));
    tr.innerHTML=`<td>${new Date(l.start).toLocaleString()}</td><td>${l.domain}</td><td class="right">${fmtDuration(dur)}</td>`;
    tbody.appendChild(tr);
  }
  const loadMore = $("#loadMoreBtn"); if (isEl(loadMore)) loadMore.style.display = end < _allRows.length ? "inline-block" : "none";
}
async function refreshLogs(applyFilterNow=false){
  const state=await getState(); cached=state;
  let rows=[...(state.logs||[])].sort((a,b)=>b.start-a.start);

  const fromEl = $("#fromDate");
  const toEl   = $("#toDate");
  const filterEl = $("#filterDomain");

  const from = (isFormInput(fromEl) && fromEl.value) ? +new Date(fromEl.value) : null;
  const to   = (isFormInput(toEl)   && toEl.value)   ? +new Date(toEl.value) + 86399999 : null;
  const filterDomain = (isFormInput(filterEl) ? filterEl.value : "").trim().toLowerCase();

  if(applyFilterNow){
    if(from) rows=rows.filter(l=>l.start>=from);
    if(to)   rows=rows.filter(l=>l.end<=to);
    if(filterDomain) rows=rows.filter(l=>(l.domain||"").toLowerCase().includes(filterDomain));
  }
  _allRows=rows; _page=1; $("#logsTable tbody").innerHTML="";
  const logsEmptyEl = $("#logsEmpty"); if (isEl(logsEmptyEl)) logsEmptyEl.style.display = _allRows.length ? "none" : "block";
  if(!_allRows.length){ const lm = $("#loadMoreBtn"); if (isEl(lm)) lm.style.display = "none"; return; }
  renderLogsPage();
}
$("#applyFilter")?.addEventListener("click", ()=>refreshLogs(true));
$("#loadMoreBtn")?.addEventListener("click", ()=>{ _page++; renderLogsPage(); });
$("#exportCsvBtn")?.addEventListener("click", async ()=>{
  const res=await chrome.runtime.sendMessage({ type:"EXPORT_CSV" });
  if(!res?.ok) return;
  const blob=new Blob([res.csv],{ type:"text/csv;charset=utf-8" });
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`ai_use_logs_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
});

/* ---------------- Rules ---------------- */
async function renderRules(){
  const { rules=[] } = await getState();
  const list=$("#rulesList"); list.innerHTML="";
  rules.forEach(r=>{
    const li=document.createElement("li");
    li.className="chip";
    li.innerHTML=`<span>${r}</span><button class="chip-x" title="Remove" data-rule="${r}">×</button>`;
    list.appendChild(li);
  });
}
$("#rulesList")?.addEventListener("click", async (e) => {
  const t = e.target;
  if (!isElement(t)) return; // ensure it's a DOM Element

  const btn = t.closest(".chip-x");
  if (!btn) return;

  const rule = /** @type {HTMLElement} */ (btn).dataset.rule || "";
  await chrome.runtime.sendMessage({ type: "REMOVE_RULE", value: rule });
  await renderRules();
});
$("#addRuleBtn")?.addEventListener("click", async ()=>{
  const nr = $("#newRule");
  if (!isFormInput(nr)) return;
  const v = nr.value.trim(); if(!v) return;
  await chrome.runtime.sendMessage({ type:"ADD_RULE", value:v });
  nr.value = "";
  await renderRules();
});
$("#resetRulesBtn")?.addEventListener("click", async ()=>{
  await chrome.runtime.sendMessage({ type:"RESET_RULES" });
  await renderRules();
});
$("#quickFromHistory")?.addEventListener("click", async ()=>{
  const [tab]=await chrome.tabs.query({ active:true, currentWindow:true });
  const d=domainFromUrl(tab?.url||""); if(!d) return;
  const nr = $("#newRule");
  if (isFormInput(nr)) nr.value = d;
});

// “Why am I tracked?” modal (updated wording)
$("#whyTracked")?.addEventListener("click", async (e)=>{
  e.preventDefault();
  const state=await getState();
  const [tab]=await chrome.tabs.query({ active:true, currentWindow:true });
  const url=tab?.url||"", host=domainFromUrl(url);
  let body="";
  if(!url){ body=`<p>No active tab URL is available.</p>`; }
  else{
    const match=(state.rules||[]).find(r=>{
      const rule=String(r||"").trim().toLowerCase();
      const h=(host||"").toLowerCase(), u=(url||"").toLowerCase();
      if (/^[a-z0-9.-]+$/.test(rule)) return h===rule || h.endsWith("."+rule);
      const token=rule.replace(/^\*+/, "");
      return token && u.includes(token);
    });
    body = match
      ? `<p><strong>Matched rule:</strong> <code>${match}</code></p>
         <p>We track a page if either:</p>
         <ul>
           <li>The domain equals the rule (or is a subdomain) — <em>default, safer</em>.</li>
           <li>Or the rule is a pattern (has “/” or “*”), then the full URL contains it — <em>legacy</em>.</li>
         </ul>
         <p>You can remove this rule to stop tracking it.</p>`
      : `<p>This page is not matched by any rule.</p>
         <p>Add a <strong>domain</strong> rule (e.g., <code>example.com</code>) for domain-only matching,
         or a <strong>pattern</strong> with “/” or “*” for full-URL contains.</p>`;
  }
  const whyBody = $("#whyBody"); if (whyBody) whyBody.innerHTML = body;
  openModal("whyModal");
});

/* ---------------- Settings: context menu discoverability ---------------- */
async function initContextTip(){
  const flags = await getUiFlags();
  const seen = !!flags.dismissedCtxTip;
  const ctx = $("#ctxTip"); if (isEl(ctx)) ctx.style.display = seen ? "none" : "block";
  const dismiss = $("#dismissCtxTip");
  if (isEl(dismiss)) dismiss.onclick = async ()=>{
    await setUiFlags({ dismissedCtxTip: true });
    if (isEl(ctx)) ctx.style.display = "none";
  };
}

/* ---------------- AI Score info modal ---------------- */
const scoreInfoBtn = $("#scoreInfoBtn");
if (scoreInfoBtn) scoreInfoBtn.addEventListener("click", ()=> openModal("scoreModal"));

function openModal(id){
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add("open");
  m.setAttribute("aria-hidden", "false");
}
function closeModal(id){
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove("open");
  m.setAttribute("aria-hidden", "true");
}
// Close any open modal when a [data-close] element is clicked
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!isElement(t)) return; // <-- narrow from EventTarget to Element

  const closeBtn = t.closest("[data-close]");
  if (!closeBtn) return;

  const id = /** @type {HTMLElement} */ (closeBtn).dataset.close || "";
  if (id) closeModal(id);
});

/* ---------------- Init & live updates ---------------- */
async function hydrate(){
  await renderHeader();
  await refreshDashboard();
  await refreshLogs();
  await renderRules();
  await refreshReport();
  await initContextTip();
  applyFriendlyTitlesForReport();
}
hydrate();
// --- Pilot links wiring (Drop C) ---
wirePilotLinks();

chrome.runtime.onMessage.addListener((msg)=>{
  if (msg?.type === "usage-updated") {
    renderHeader();
    refreshDashboard();
    refreshLogs();
    refreshReport();
  }
});

// About & Policy button
document.getElementById("aboutBtn")?.addEventListener("click", ()=> openModal("aboutModal"));

// First-run intro card (inject once)
(async function introCard(){
  try {
    const { seenIntro } = await chrome.storage.local.get("seenIntro");
    if (seenIntro) return;
    const host = document.getElementById("dashboardSection");
    if (!host) return;
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title"><span>Welcome to C.L.A.R.A.</span></div>
      <p class="hint" style="margin-top:4px">
        Tracks <strong>time</strong> on AI sites you choose (see <em>Rules</em>). Data stays <strong>local</strong>.
        Pause anytime. Export reports if you wish.
      </p>
      <div class="row" style="margin-top:6px">
        <button id="introGotIt" class="primary" type="button">Got it</button>
        <button id="introAbout" class="ghost" type="button">About & Policy</button>
      </div>`;
    host.prepend(card);
    document.getElementById("introGotIt")?.addEventListener("click", async ()=>{
      await chrome.storage.local.set({ seenIntro: true });
      card.remove();
    });
    document.getElementById("introAbout")?.addEventListener("click", ()=> openModal("aboutModal"));
  } catch {}
})();