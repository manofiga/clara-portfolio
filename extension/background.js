// @ts-check
// background.js — domain-only tracking + interaction heartbeats + weekly portfolio export (v0.1)

/* =========================
   Constants & in-memory state
   ========================= */

const DEFAULT_RULES = [
  "chatgpt.com",
  "chat.openai.com",
  "openai.com",
  "claude.ai",
  "gemini.google.com",
  "perplexity.ai",
  "midjourney.com",
  "runwayml.com",
  "poe.com"
];

const ACTIVITY_STALE_MS = 60_000;  // if no heartbeat for 60s, consider idle
const TICK_MS           = 5_000;   // (kept for reference; alarms handle ticks)
const MERGE_GAP_MS      = 120_000; // <= 120s gap with same domain → merge

const state = {
  trackingEnabled: true,
  rules: new Set(),
  /** @type {null | { tabId:number, domain:string, start:number }} */
  active: null,
  pausedUntil: 0,
  badgeMode: "minutes",
  /** @type {Map<number, number>} tabId -> last heartbeat ts */
  lastActivityByTab: new Map(),
};

const DEBUG = false; // flip to true while diagnosing
function dlog(...args){ if (DEBUG) console.log("[aiu]", ...args); }

/* =========================
   Safe wrappers for chrome.*
   ========================= */

const A = {
  async alarmsGetAll() {
    try { return await chrome.alarms.getAll(); }
    catch(e){ dlog("alarms.getAll", e); return []; }
  },
  async alarmsCreate(name, info) {
    try { await chrome.alarms.create(name, info); }
    catch(e){ dlog("alarms.create", name, e); }
  },
  async alarmsClear(name) {
    try { await chrome.alarms.clear(name); }
    catch(e){ dlog("alarms.clear", name, e); }
  },
  async tabsQuery(q) {
    try { return await chrome.tabs.query(q); }
    catch(e){ dlog("tabs.query", e); return []; }
  },
  async tabsGet(id) {
    try { return await chrome.tabs.get(id); }
    catch(e){ dlog("tabs.get", id, e); return null; }
  },
  async storageGet(keys) {
    try { return await chrome.storage.local.get(keys); }
    catch(e){ dlog("storage.get", keys, e); return {}; }
  },
  async storageSet(obj) {
    try { await chrome.storage.local.set(obj); }
    catch(e){ dlog("storage.set", obj, e); }
  },
  actionSetBadgeText(opts) {
    try { chrome.action.setBadgeText(opts); }
    catch(e){ dlog("setBadgeText", e); }
  },
  actionSetBadgeBackgroundColor(opts) {
    try { chrome.action.setBadgeBackgroundColor(opts); }
    catch(e){ dlog("setBadgeColor", e); }
  },
  runtimeSendMessage(msg) {
    try { chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError); }
    catch(e){ dlog("sendMessage", e); }
  },
  contextMenusRemoveAll() {
    try { chrome.contextMenus.removeAll(() => void chrome.runtime.lastError); }
    catch(e){ dlog("removeAll", e); }
  },
  contextMenusCreate(opts) {
    try { chrome.contextMenus.create(opts, () => void chrome.runtime.lastError); }
    catch(e){ dlog("contextMenus.create", e); }
  },
  notificationsCreate(id, opts) {
    try { chrome.notifications.create(id, opts, () => void chrome.runtime.lastError); }
    catch(e){ dlog("notifications.create", id, e); }
  },
};

/* =========================
   Notifications prefs & helpers
   ========================= */

const NOTIFY_IDS = {
  welcome:"aiu-welcome",
  weekly:"aiu-weekly",
  long:"aiu-long-session",
};

const DEFAULT_NOTIFY_PREFS = {
  notifyWeekly:true,
  weeklyDay:1,   // reserved
  weeklyHour:9,  // reserved
  notifyLongSession:true,
  longSessionMinutes:120,
};

async function getNotifyPrefs(){
  const cur = await A.storageGet("notifyPrefs");
  return { ...DEFAULT_NOTIFY_PREFS, ...(cur.notifyPrefs || {}) };
}
async function getSettings(){
  const cur = await A.storageGet("settings");
  const def = {
    analytics: { includeDomains:true, includeSessions:true, hashAlias:false, contextTag:"", validator:null },
    attachment: { includeTopDomain:false },
    salt: { perInstitution:"" }
  };
  const s = cur.settings || {};
  return {
    analytics: { ...def.analytics, ...(s.analytics||{}) },
    attachment: { ...def.attachment, ...(s.attachment||{}) },
    salt: { ...def.salt, ...(s.salt||{}) }
  };
}
function showNotification(id, title, message){
  A.notificationsCreate(`${id}-${Date.now()}`, {
    type:"basic",
    iconUrl:"icons/icon128.png",
    title,
    message,
    priority:0
  });
}

/* =========================
   Weekly digest
   ========================= */

function computeNextMon9(){
  const now = new Date();
  const next = new Date(now);
  const daysToMon = (1 - now.getDay() + 7) % 7 || 7; // at least next Monday
  next.setDate(now.getDate() + daysToMon);
  next.setHours(9,0,0,0);
  return +next;
}

async function scheduleWeeklyDigest(){
  const all = await A.alarmsGetAll();
  if (!all.some(a => a.name === "aiu-weekly")) {
    await A.alarmsCreate("aiu-weekly", {
      when: computeNextMon9(),
      periodInMinutes: 7 * 24 * 60,
    });
  }
}

async function startBadgeTick(){
  const all = await A.alarmsGetAll();
  if (!all.some(a => a.name === "aiu-badge-tick")) {
    await A.alarmsCreate("aiu-badge-tick", { periodInMinutes: 0.0833333 }); // ~5s
  }
}

async function migrateAlarms(){
  const KEEP = new Set(["aiu-weekly", "aiu-badge-tick"]);
  const all = await A.alarmsGetAll();
  await Promise.all(all.map(a => (KEEP.has(a.name) ? Promise.resolve() : A.alarmsClear(a.name))));
  await scheduleWeeklyDigest();
  await startBadgeTick();
}

async function restoreActiveFromStorage(){
  const { sessions = {} } = await A.storageGet("sessions");
  if (sessions && sessions.active && !state.active) {
    state.active = sessions.active; // { tabId, domain, start }
  }
}

async function sendWeeklyDigest(){
  const { logs = [] } = await A.storageGet("logs");
  const weekStart = startOfWeek(Date.now());
  const weekEnd   = endOfWeek(Date.now());

  let sec = 0;
  const perDomain = new Map();
  for (const l of logs) {
    const s = Math.max(l.start, weekStart);
    const e = Math.min(l.end,   weekEnd);
    if (e > s) {
      const add = Math.floor((e - s) / 1000);
      sec += add;
      if (l.domain) perDomain.set(l.domain, (perDomain.get(l.domain) || 0) + add);
    }
  }
  let top = "—", topSec = 0;
  for (const [d, s] of perDomain.entries()) { if (s > topSec) { topSec = s; top = d; } }

  const mins  = Math.floor(sec / 60);
  const prefs = await getNotifyPrefs();
  if (prefs.notifyWeekly) {
    showNotification(NOTIFY_IDS.weekly, "AI Use — Weekly Summary", `Total: ${mins} min • Top site: ${top}`);
  }
}

async function onAlarm(alarm){
  try {
    switch (alarm?.name) {
      case "aiu-weekly":
        await sendWeeklyDigest();
        break;
      case "aiu-badge-tick":
        await updateBadge();
        await enforceIdleTimeout();
        await maybeLongSessionNudge();
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("onAlarm failed:", alarm?.name, err);
  }
}

/* =========================
   Long-session nudge
   ========================= */

async function maybeLongSessionNudge(){
  const prefs = await getNotifyPrefs();
  if (!prefs.notifyLongSession) return;

  const act = state.active;
  if (!act) return;
  if (Date.now() < state.pausedUntil) return;

  const durMin = Math.floor((Date.now() - act.start) / 60000);
  if (durMin < (prefs.longSessionMinutes || 120)) return;

  const { nudgedAtDay = null } = await A.storageGet("nudgedAtDay");
  const todayKey = new Date().toISOString().slice(0,10);
  if (nudgedAtDay === todayKey) return;

  showNotification(
    NOTIFY_IDS.long,
    "Long AI session",
    `You've been on ${act.domain} for about ${durMin} minutes. Take a short break?`
  );
  await A.storageSet({ nudgedAtDay: todayKey });
}

// Human‑friendly labels for all exports (path-aware)
const FRIENDLY_LABELS = {
  // ---- Portfolio (v0.1)
  "version": "Schema version",
  "alias": "User name / tag",
  "consent": "Data sharing consent",
  "week_start": "Week begins",
  "week_end": "Week ends",
  "totals": "Total usage",
  "totals.minutes": "Total minutes this week",
  "totals.by_domain": "Minutes by site",
  "score": "AI Score",
  "most_active_day": "Most active day",
  "most_active_day.iso": "Date",
  "most_active_day.minutes": "Minutes",
  "change_vs_prev_week_pct": "Change vs last week (%)",
  "streak_weeks": "Streak (weeks active)",
  "badge": "User type",
  "provenance": "Technical details",
  "provenance.created_at": "Export created",
  "provenance.device_local_only": "Stored only on this device",
  "provenance.extension_version": "Extension version",
  "weekly_breakdown": "Daily usage (minutes)",
  "weekly_breakdown[].day": "Day",
  "weekly_breakdown[].minutes": "Minutes",

  // ---- Attachment (v0.1)
  "schema_version": "Schema version",
  "session_id": "Session id",
  "timestamp_start": "Window start (ISO)",
  "timestamp_end": "Window end (ISO)",
  "tool": "Tool",
  "tool.name": "Tool name",
  "tool.version": "Tool version",
  "task_type": "Task type",
  "pseudonymisation": "Pseudonymisation",
  "pseudonymisation.user_hash": "User hash (salted)",
  "pseudonymisation.context_tag": "Context tag",
  "validator": "Validator",
  "validator.conformance": "Conformance",
  "validator.ruleset": "Ruleset",

  // ---- Analytics (v0.1)
  "export_type": "Export type",
  "generated_at": "Generated at",
  "subject": "Subject",
  "subject.alias": "User name / tag",
  "subject.consent": "Data sharing consent",
  "week": "This week",
  "week.start_iso": "Week begins (ISO)",
  "week.end_iso": "Week ends (ISO)",
  "week.total_minutes": "Total minutes this week",
  "week.per_day_minutes": "Daily usage (minutes)",
  "week.per_domain_minutes": "Minutes by site",
  "week.top_domain": "Top AI tool",
  "week.change_vs_prev_week_pct": "Change vs last week (%)",
  "week.streak_weeks": "Streak (weeks active)",
  "week.ai_score": "AI Score",
  "week.badge": "User type",
  "history": "History",
  "history.last_4_weeks": "Last 4 weeks",
  "history.last_4_weeks[].week_start": "Week start (ISO)",
  "history.last_4_weeks[].minutes": "Minutes",
  "sessions_sample": "Sessions sample",
  "sessions_sample[].start_iso": "Start (ISO)",
  "sessions_sample[].end_iso": "End (ISO)",
  "sessions_sample[].domain": "Site",
  "sessions_sample[].duration_seconds": "Duration (sec)",
  "integrity": "Integrity",
  "integrity.logs_count": "Logs count",
  "integrity.window_start_iso": "Window start (ISO)",
  "integrity.window_end_iso": "Window end (ISO)"
};

// attach our human‑friendly labels to any payload
function withFriendly(obj){
  try {
    return { ...obj, friendly: FRIENDLY_LABELS };
  } catch {
    return obj;
  }
}

/* =========================
   Boot/init + guarded listeners
   ========================= */

const onInstalledHandler = async () => { try { await migrateAlarms(); } catch(e){ dlog("onInstalled", e); } };
const onStartupHandler   = async () => { try { await migrateAlarms(); } catch(e){ dlog("onStartup", e); } };

const heartbeatMsgHandler = (msg, sender) => {
  try {
    const tabId = sender?.tab?.id;
    if (!tabId) return;

    if (msg?.type === "HEARTBEAT") {
      const ts = msg.ts || Date.now();
      state.lastActivityByTab.set(tabId, ts);

      if (!state.active && typeof sender.tab?.url === "string" && urlMatchesRules(sender.tab.url)) {
        startSession(tabId, urlToDomain(sender.tab.url)).catch(() => {});
        return;
      }
      maybeStartOrExtend(tabId).catch(() => {});
    }
  } catch (e) { dlog("heartbeatMsgHandler", e); }
};

init().catch(console.error);

async function init(){
  await ensureDefaults();
  await hydrateCache();
  await compactLogsOnBoot();

  await migrateAlarms();
  await restoreActiveFromStorage();

  if (!chrome.runtime.onInstalled.hasListener(onInstalledHandler)) chrome.runtime.onInstalled.addListener(onInstalledHandler);
  if (!chrome.runtime.onStartup.hasListener(onStartupHandler))     chrome.runtime.onStartup.addListener(onStartupHandler);
  if (!chrome.alarms.onAlarm.hasListener(onAlarm))                 chrome.alarms.onAlarm.addListener(onAlarm);
  if (!chrome.tabs.onActivated.hasListener(handleTabActivated))    chrome.tabs.onActivated.addListener(handleTabActivated);
  if (!chrome.tabs.onUpdated.hasListener(handleTabUpdated))        chrome.tabs.onUpdated.addListener(handleTabUpdated);
  if (!chrome.tabs.onRemoved.hasListener(handleTabRemoved))        chrome.tabs.onRemoved.addListener(handleTabRemoved);
  if (!chrome.windows.onFocusChanged.hasListener(handleWindowFocusChanged)) chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);
  if (!chrome.storage.onChanged.hasListener(onStorageChanged))     chrome.storage.onChanged.addListener(onStorageChanged);
  if (!chrome.runtime.onMessage.hasListener(heartbeatMsgHandler))  chrome.runtime.onMessage.addListener(heartbeatMsgHandler);

  if (chrome.contextMenus) {
    A.contextMenusRemoveAll();
    A.contextMenusCreate({ id:"aiu-add-site",    title:"Add this site to AI Rules", contexts:["page"] });
    A.contextMenusCreate({ id:"aiu-pause-15",    title:"Pause 15 minutes",          contexts:["page"] });
    A.contextMenusCreate({ id:"aiu-pause-60",    title:"Pause 1 hour",               contexts:["page"] });
    A.contextMenusCreate({ id:"aiu-pause-today", title:"Pause for Today",            contexts:["page"] });
    A.contextMenusCreate({ id:"aiu-resume",      title:"Resume tracking",            contexts:["page"] });
    if (!chrome.contextMenus.onClicked.hasListener(onMenu)) chrome.contextMenus.onClicked.addListener(onMenu);
  }

  await ensureFromCurrentContext();
}

/* =========================
   Defaults & cache
   ========================= */

async function ensureDefaults(){
  const cur = await A.storageGet(["rules","trackingEnabled","logs","pausedUntil","badgeMode","portfolioPrefs"]);
  const next = {};
  if (!Array.isArray(cur.rules) || cur.rules.length === 0) next.rules = DEFAULT_RULES;
  if (typeof cur.trackingEnabled !== "boolean") next.trackingEnabled = true;
  if (!Array.isArray(cur.logs)) next.logs = [];
  if (typeof cur.pausedUntil !== "number") next.pausedUntil = 0;
  if (!cur.badgeMode) next.badgeMode = "minutes";
  if (!cur.portfolioPrefs || typeof cur.portfolioPrefs !== "object") {
    next.portfolioPrefs = { alias:"student", consent:true };
  }
    // --- NEW: analytics / attachment flags + per-institution salt
  if (!cur.settings || typeof cur.settings !== "object") {
    next.settings = {
      analytics: {
        includeDomains: true,
        includeSessions: true,
        hashAlias: false,
        contextTag: "",       // optional course/class code
        validator: null       // e.g., { conformance:"v1", ruleset:"portfolio_v01" }
      },
      attachment: {
        includeTopDomain: false
      },
      salt: {
        perInstitution: crypto.getRandomValues(new Uint32Array(4)).join("-") // stable after first run
      }
    };
  }
  if (Object.keys(next).length) await A.storageSet(next);
}

async function hydrateCache(){
  const { rules, trackingEnabled, pausedUntil, badgeMode } =
    await A.storageGet(["rules","trackingEnabled","pausedUntil","badgeMode"]);
  state.rules = new Set(rules || DEFAULT_RULES);
  state.trackingEnabled = (trackingEnabled !== false);
  state.pausedUntil = pausedUntil || 0;
  state.badgeMode = badgeMode || "minutes";
}

function onStorageChanged(changes, area){
  if (area !== "local") return;
  if (changes.rules)           state.rules = new Set(changes.rules.newValue || []);
  if (changes.pausedUntil)     state.pausedUntil = changes.pausedUntil.newValue || 0;
  if (changes.trackingEnabled) state.trackingEnabled = !!changes.trackingEnabled.newValue;
  if (changes.badgeMode)       state.badgeMode = changes.badgeMode.newValue || "minutes";
}

/* =========================
   URL helpers & matching
   ========================= */

function urlToDomain(url){ try { return new URL(url).host; } catch { return ""; } }
function normalizeRule(r){ return String(r||"").trim().toLowerCase(); }
function isDomainLike(rule){ return /^[a-z0-9.-]+$/.test(rule); }

function urlMatchesRules(url){
  if (!url) return false;
  const host = urlToDomain(url).toLowerCase();
  const full = url.toLowerCase();
  for (const r of state.rules) {
    const rule = normalizeRule(r);
    if (!rule) continue;
    if (isDomainLike(rule)) {
      if (host === rule || host.endsWith("." + rule)) return true;
    } else {
      const token = rule.replace(/^\*+/, "");
      if (token && full.includes(token)) return true;
    }
  }
  return false;
}

/* =========================
   Session control
   ========================= */

async function handleTabActivated({ tabId, windowId }){
  await maybeCloseActive("tab switch");
  await maybeStartOrExtend(tabId, windowId);
}

async function handleTabUpdated(tabId, changeInfo, tab){
  if (changeInfo.status && changeInfo.status !== "complete") return;
  if (tab?.active && typeof tab.url === "string") {
    const stillMatches = urlMatchesRules(tab.url);
    if (!stillMatches && state.active?.tabId === tabId) {
      await endActiveSession("tab left rules");
      return;
    }
    if (stillMatches) await maybeStartOrExtend(tabId, tab.windowId);
  }
}

async function handleTabRemoved(tabId){
  if (state.active?.tabId === tabId) await endActiveSession("tab closed");
  state.lastActivityByTab.delete(tabId);
}

async function handleWindowFocusChanged(windowId){
  if (!windowId || windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await A.tabsQuery({ active:true, windowId });
  if (tab && urlMatchesRules(tab.url || "")) {
    await maybeStartOrExtend(tab.id, tab.windowId);
  }
}

async function ensureFromCurrentContext(){
  const [tab] = await A.tabsQuery({ active:true, lastFocusedWindow:true });
  if (tab) await maybeStartOrExtend(tab.id, tab.windowId);
}

async function maybeStartOrExtend(tabId, _windowId){
  try {
    const tab = await A.tabsGet(tabId);
    if (!tab || !tab.active) return;
    if (!urlMatchesRules(tab.url || "")) return;
    if (!state.trackingEnabled) return;
    if (Date.now() < state.pausedUntil) return;

    if (state.active?.tabId === tabId) return; // already tracking this tab
    dlog("↔️ extendSession", { tabId, url: tab.url });
    await startSession(tabId, urlToDomain(tab.url || ""));
  } catch (err) { dlog("maybeStartOrExtend failed:", err); }
}

async function maybeCloseActive(_reason){
  if (!state.active) return;
  await endActiveSession(_reason);
}

async function startSession(tabId, domain){
  const now = Date.now();
  state.lastActivityByTab.set(tabId, now);
  dlog("▶️ startSession", { tabId, domain, start: now });

  state.active = { tabId, domain, start: now };
  await A.storageSet({ sessions: { active: state.active } });
  broadcastUsageUpdated();
}

async function endActiveSession(reason){
  dlog("⏹ endActiveSession:", reason, state.active);
  const act = state.active;
  if (!act) return;

  const end = Date.now();
  const dur = Math.max(0, end - act.start);

  state.active = null;
  await A.storageSet({ sessions: { active: null } });

  const store = await A.storageGet("logs");
  const logs = Array.isArray(store.logs) ? store.logs : [];

  if (dur >= 1000) {
    logs.push({ start: act.start, end, domain: act.domain });
    const merged = compactLogs(logs);
    await A.storageSet({ logs: merged });
  } else {
    await A.storageSet({ logs });
  }
  dlog("✅ saved log", { domain: act.domain, durSec: Math.round(dur/1000) });
  broadcastUsageUpdated();
}

/* =========================
   Idle timeout
   ========================= */

async function enforceIdleTimeout(){
  const act = state.active;
  if (!act) return;

  const last = state.lastActivityByTab.get(act.tabId) || 0;
  if (last === 0) return;

  const idleMs = Date.now() - last;
  if (idleMs > ACTIVITY_STALE_MS) {
    dlog("💤 idle timeout", { idleMs });
    await endActiveSession("idle timeout");
  }
}

/* =========================
   Log compaction
   ========================= */

function compactLogs(logs){
  if (!Array.isArray(logs) || logs.length <= 1) return logs || [];
  const arr = [...logs]
    .filter(l => typeof l?.start === "number" && typeof l?.end === "number" && l.end >= l.start)
    .sort((a, b) => (a.start || 0) - (b.start || 0));
  if (!arr.length) return [];

  const out = [];
  let cur = { ...arr[0] };
  if (cur.end < cur.start) cur.end = cur.start;

  for (let i = 1; i < arr.length; i++) {
    const nxt = arr[i];
    const sameDomain = (nxt.domain || "") === (cur.domain || "");
    const gap = (nxt.start || 0) - (cur.end || 0);

    if (sameDomain && gap >= 0 && gap <= MERGE_GAP_MS) {
      cur.end = Math.max(cur.end, nxt.end);
    } else {
      out.push(cur);
      cur = { ...nxt };
      if (cur.end < cur.start) cur.end = cur.start;
    }
  }
  out.push(cur);
  return out;
}

async function compactLogsOnBoot(){
  try {
    const { logs = [] } = await A.storageGet("logs");
    const merged = compactLogs(logs);
    if (merged.length !== logs.length) {
      await A.storageSet({ logs: merged });
      broadcastUsageUpdated();
    }
  } catch (e) { dlog("compactLogsOnBoot failed", e); }
}

// ---- Attachment-ready export helpers ----
function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(str) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return toHex(hash);
}
function isoFloorMinute(ts) {
  const d = new Date(ts);
  d.setSeconds(0, 0);
  return d.toISOString();
}

/* =========================
   Context menu
   ========================= */

async function onMenu(info, tab){
  const url = tab?.url || "";
  const d = urlToDomain(url);

  if (info.menuItemId === "aiu-add-site" && d) {
    const cur = await A.storageGet("rules");
    const arr = Array.isArray(cur.rules) ? cur.rules : Array.from(state.rules);
    if (!arr.includes(d)) {
      arr.push(d);
      await A.storageSet({ rules: arr });
    }
    broadcastUsageUpdated();
  } else if (info.menuItemId === "aiu-pause-15") {
    await pauseFor(15);
  } else if (info.menuItemId === "aiu-pause-60") {
    await pauseFor(60);
  } else if (info.menuItemId === "aiu-pause-today") {
    const eod = endOfToday();
    const mins = Math.max(1, Math.floor((eod - Date.now()) / 60000));
    await pauseFor(mins);
  } else if (info.menuItemId === "aiu-resume") {
    await resumeAll();
  }
}

/* =========================
   Messages from popup
   ========================= */

function broadcastUsageUpdated(){
  A.runtimeSendMessage({ type:"usage-updated" });
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  let responded = false;

  (async () => {
    try {
      if (req.type === "GET_STATE") {
        const { rules, trackingEnabled, pausedUntil, badgeMode, logs = [], portfolioPrefs = { alias:"student", consent:true } } =
          await A.storageGet(["rules","trackingEnabled","pausedUntil","badgeMode","logs","portfolioPrefs"]);
        sendResponse({
          rules: rules || Array.from(state.rules),
          trackingEnabled: trackingEnabled !== false,
          logs,
          active: state.active,
          pausedUntil: pausedUntil || 0,
          badgeMode: badgeMode || state.badgeMode,
          portfolioPrefs
        });
        responded = true;
      }
      else if (req.type === "PAUSE_FOR") {
        await pauseFor(req.minutes || 15);
        sendResponse({ ok: true });
        responded = true;
      }
      else if (req.type === "RESUME") {
        await resumeAll();
        sendResponse({ ok: true });
        responded = true;
      }
      else if (req.type === "RESET_TODAY") {
        const sod = startOfDay(Date.now());
        const store = await A.storageGet("logs");
        const logs = Array.isArray(store.logs) ? store.logs : [];
        const keep = logs.filter(l => (l.end || 0) < sod);
        await A.storageSet({ logs: compactLogs(keep) });
        await maybeCloseActive("reset today");
        broadcastUsageUpdated();
        sendResponse({ ok: true });
        responded = true;
      }
      else if (req.type === "CLEAR_DATA") {
        await A.storageSet({ logs: [], sessions: { active: null } });
        state.active = null;
        broadcastUsageUpdated();
        sendResponse({ ok: true });
        responded = true;
      }
      else if (req.type === "ADD_RULE") {
        const { rules = [] } = await A.storageGet("rules");
        if (!rules.includes(req.value)) rules.push(req.value);
        await A.storageSet({ rules });
        sendResponse({ ok: true });
        responded = true;
      }
      else if (req.type === "REMOVE_RULE") {
        const { rules = [] } = await A.storageGet("rules");
        const next = rules.filter(r => r !== req.value);
        await A.storageSet({ rules: next });
        sendResponse({ ok: true });
        responded = true;
      }
      else if (req.type === "RESET_RULES") {
        await A.storageSet({ rules: DEFAULT_RULES });
        sendResponse({ ok: true });
        responded = true;
      }
      else if (req.type === "EXPORT_CSV") {
        const { logs = [] } = await A.storageGet("logs");
        const F = FRIENDLY_LABELS; // (not FRIENDLY)
        const rows = [[
   F["sessions_sample[].start_iso"] || "Start (ISO)",
   F["sessions_sample[].end_iso"]   || "End (ISO)",
   F["sessions_sample[].domain"]    || "Site",
   F["sessions_sample[].duration_seconds"] || "Duration (sec)"
 ]]
          .concat(logs.map(l => [l.start, l.end, l.domain, Math.max(0, Math.round((l.end - l.start) / 1000))]));
        const csv = rows.map(r => r.join(",")).join("\n");
        sendResponse({ ok: true, csv });
        responded = true;
      }
      else if (req.type === "SET_BADGE_MODE") {
        await A.storageSet({ badgeMode: req.value || "minutes" });
        state.badgeMode = req.value || "minutes";
        await updateBadge();
        sendResponse({ ok: true });
        responded = true;
      }
      else if (req.type === "SET_STORAGE_FLAGS") {
        const cur = await A.storageGet("uiFlags");
        await A.storageSet({ uiFlags: { ...(cur.uiFlags||{}), ...(req.flags||{}) } });
        sendResponse({ ok: true });
        responded = true;
      }
      else if (req.type === "GET_STORAGE_FLAGS") {
        const { uiFlags = {} } = await A.storageGet("uiFlags");
        sendResponse({ ok: true, uiFlags });
        responded = true;
      }
      else if (req.type === "SET_PORTFOLIO_PREFS") {
        const cur = await A.storageGet("portfolioPrefs");
        const next = { ...(cur.portfolioPrefs||{}), ...(req.value||{}) };
        await A.storageSet({ portfolioPrefs: next });
        sendResponse({ ok:true, portfolioPrefs: next });
        responded = true;
      }
      else if (req.type === "EXPORT_PORTFOLIO_V01") {
        const json = await buildPortfolioV01();
        sendResponse({ ok: true, json });
        responded = true;
      }
        else if (req.type === "EXPORT_PORTFOLIO_WEEKLY_V01") {
        const json = await buildPortfolioWeeklyV01();
        sendResponse({ ok: true, json });
        responded = true;
      }
      else if (req.type === "EXPORT_ATTACHMENT_V01") {
      const json = await buildAttachmentV01();
      sendResponse({ ok: true, json });
      responded = true;
      }

      else if (req.type === "EXPORT_ANALYTICS_V01") {
      const json = await buildAnalyticsV01();
      sendResponse({ ok: true, json });
      responded = true;
      }

      else if (req.type === "BACKUP_EXPORT") {
        const keys = ["rules","trackingEnabled","logs","sessions","pausedUntil","themePref","badgeMode","uiFlags"];
        const all = await A.storageGet(keys);
        sendResponse({ ok: true, data: all, exported_at: new Date().toISOString() });
        responded = true;
      }
      else if (req.type === "BACKUP_IMPORT") {
        try {
          const b = req.data || {};
          const next = {
            rules: Array.isArray(b.rules) ? b.rules : undefined,
            trackingEnabled: typeof b.trackingEnabled === "boolean" ? b.trackingEnabled : undefined,
            logs: Array.isArray(b.logs) ? b.logs : undefined,
            sessions: (b.sessions && typeof b.sessions === "object") ? b.sessions : undefined,
            pausedUntil: typeof b.pausedUntil === "number" ? b.pausedUntil : 0,
            themePref: b.themePref || "system",
            badgeMode: b.badgeMode || "minutes",
            uiFlags: (b.uiFlags && typeof b.uiFlags === "object") ? b.uiFlags : undefined,
          };
          Object.keys(next).forEach(k => next[k] === undefined && delete next[k]);
          await A.storageSet(next);
          if (next.rules) state.rules = new Set(next.rules);
          if (typeof next.trackingEnabled === "boolean") state.trackingEnabled = next.trackingEnabled;
          if (typeof next.pausedUntil === "number") state.pausedUntil = next.pausedUntil;
          if (next.badgeMode) state.badgeMode = next.badgeMode;
          await updateBadge();
          broadcastUsageUpdated();
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        responded = true;
      }
      else if (req.type === "CLEAR_ALL_DATA") {
        try {
          await A.storageSet({ logs: [], sessions: { active: null } });
          state.active = null;
          broadcastUsageUpdated();
          await updateBadge();
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        responded = true;
      }
      else {
        sendResponse({ ok: false, error: "Unknown message type", type: req?.type });
        responded = true;
      }
    } catch (e) {
      if (!responded) sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true;
});

/* =========================
   Pause/Resume & Badge
   ========================= */

async function pauseFor(mins){
  const until = Date.now() + mins * 60000;
  state.pausedUntil = until;
  await A.storageSet({ pausedUntil: until });
  await maybeCloseActive("paused");
  await updateBadge();
  broadcastUsageUpdated();
}

async function resumeAll(){
  state.pausedUntil = 0;
  await A.storageSet({ pausedUntil: 0 });
  await ensureFromCurrentContext();
  await updateBadge();
  broadcastUsageUpdated();
}

async function updateBadge() {
  if (state.badgeMode === "none") {
    A.actionSetBadgeText({ text: "" });
    return;
  }

  // Special pause handling: if pausedUntil is in the future, show ⏸
  if (Date.now() < state.pausedUntil) {
    A.actionSetBadgeBackgroundColor({ color: "#f59e0b" }); // amber
    A.actionSetBadgeText({ text: "⏸" });
    return;
  }

  if (state.badgeMode === "onoff") {
    const on = state.trackingEnabled;
    A.actionSetBadgeBackgroundColor({ color: on ? "#22c55e" : "#9ca3af" });
    A.actionSetBadgeText({ text: on ? "ON" : "OFF" });
    return;
  }

  // Default: minutes today
  const now = Date.now();
  const sod = startOfDay(now);
  const { logs = [] } = await A.storageGet("logs");
  let sec = 0;
  for (const l of logs) {
    const s = Math.max(l.start, sod);
    const e = Math.min(l.end, now);
    if (e > s) sec += (e - s) / 1000;
  }
  if (state.active?.start) {
    sec += (now - Math.max(state.active.start, sod)) / 1000;
  }

  const mins = String(Math.floor(sec / 60));
  A.actionSetBadgeBackgroundColor({ color: "#3b82f6" });
  A.actionSetBadgeText({ text: mins || "" });
}

/* =========================
   Portfolio builder (v0.1)
   ========================= */

function startOfDay(ts){ const d=new Date(ts); d.setHours(0,0,0,0); return +d; }
function endOfToday(){ const d=new Date(); d.setHours(23,59,59,999); return +d; }
function startOfWeek(ts=Date.now()){ const d=new Date(ts); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return +d; }
function endOfWeek(ts=Date.now()){ return startOfWeek(ts) + 7*86400000 - 1; }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function calcAiScore(hours){
  if (hours < 5)  return 100;
  if (hours <= 15) return Math.round(80 - (hours - 5) * 2);
  if (hours <= 20) return Math.round(60 - (hours - 15) * 2);
  return clamp(Math.round(50 - (hours - 20) * 2), 20, 100);
}

async function buildPortfolioV01(){
  const now = Date.now();
  const weekStart = startOfWeek(now);
  const weekEnd   = endOfWeek(now);

  const { logs = [], portfolioPrefs = { alias:"student", consent:true } } =
    await A.storageGet(["logs","portfolioPrefs"]);

  const all = [...logs];
  if (state.active?.start && state.active?.tabId) {
    all.push({ start: state.active.start, end: now, domain: state.active.domain });
  }

  const perDay = new Array(7).fill(0);
  const perDomain = new Map();
  for (const l of all) {
    const s = Math.max(l.start, weekStart);
    const e = Math.min(l.end,   weekEnd);
    if (e <= s) continue;

    const sec = Math.floor((e - s) / 1000);
    const dayIdx = Math.floor((startOfDay(s) - weekStart) / 86400000);
    if (dayIdx >=0 && dayIdx < 7) perDay[dayIdx] += Math.round(sec/60);

    perDomain.set(l.domain, (perDomain.get(l.domain)||0) + Math.round(sec/60));
  }

  const totalMin = perDay.reduce((a,b)=>a+b,0);
  let topName = "—", topMin = 0;
  for (const [d,m] of perDomain.entries()) { if (m > topMin) { topMin = m; topName = d; } }

  const mostIdx = perDay.reduce((best,i,_,arr)=> arr[i]>arr[best]?i:best, 0);
  const mostISO = new Date(weekStart + mostIdx*86400000).toISOString().slice(0,10);

  const prevStart = startOfWeek(weekStart - 86400000);
  const prevEnd   = endOfWeek(prevStart);
  let prevMin = 0;
  for (const l of logs) {
    const s = Math.max(l.start, prevStart);
    const e = Math.min(l.end,   prevEnd);
    if (e > s) prevMin += Math.round((e - s)/60000);
  }
  const changePct = prevMin>0 ? ((totalMin - prevMin) / prevMin) * 100 : null;

  let streak = 0;
  let cursorEnd = weekEnd;
  while (true) {
    const wS = startOfWeek(cursorEnd);
    const wE = endOfWeek(cursorEnd);
    let mins = 0;
    for (const l of logs) {
      const s = Math.max(l.start, wS);
      const e = Math.min(l.end,   wE);
      if (e > s) mins += Math.round((e - s)/60000);
    }
    if (mins > 0) { streak++; cursorEnd = wS - 1; } else break;
  }

  const score = calcAiScore(totalMin / 60);
  const badge = score>=80 ? "Healthy" : (score>=50 ? "Power User" : "Super User");
  const labels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const weekly_breakdown = perDay.map((m,i)=>({ day: labels[i], minutes: m }));

  const portfolio = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "version": "0.1",
    "alias": portfolioPrefs.alias || "student",
    "consent": !!portfolioPrefs.consent,
    "week_start": new Date(weekStart).toISOString().slice(0,10),
    "week_end":   new Date(weekEnd).toISOString().slice(0,10),
    "totals": {
      "minutes": totalMin,
      "by_domain": Object.fromEntries([...perDomain.entries()].sort((a,b)=>b[1]-a[1]))
    },
    "score": score,
    "most_active_day": { "iso": mostISO, "minutes": perDay[mostIdx] || 0 },
    "change_vs_prev_week_pct": changePct === null ? null : Number(changePct.toFixed(1)),
    "streak_weeks": streak,
    "badge": badge,
    "provenance": {
      "created_at": new Date().toISOString(),
      "device_local_only": true,
      "extension_version": chrome.runtime.getManifest().version || "1.x"
    },
    "weekly_breakdown": weekly_breakdown,
    // NOTE: no friendly map in output
};
return JSON.stringify(portfolio, null, 2);
}

async function buildPortfolioWeeklyV01(){
  // Start from the single-week snapshot
  const baseJson = await buildPortfolioV01();
  /** @type {any} */ const base = JSON.parse(baseJson);

  const now = Date.now();
  const thisWStart = startOfWeek(now);
  const thisWEnd   = endOfWeek(now);

  const { logs = [] } = await A.storageGet("logs");

  // 4-week history (newest last)
  const historyWeeks = [];
  for (let k = 3; k >= 0; k--) {
    const ws = startOfWeek(thisWStart - k*7*86400000), we = endOfWeek(ws);
    let mins = 0;
    for (const l of logs) {
      const s = Math.max(l.start, ws);
      const e = Math.min(l.end,   we);
      if (e > s) mins += Math.round((e - s)/60000);
    }
    historyWeeks.push({ week_start: new Date(ws).toISOString().slice(0,10), minutes: mins });
  }

  // integrity window + count
  const winStart = logs.length ? Math.min(...logs.map(l=>l.start), thisWStart) : thisWStart;
  const winEnd   = logs.length ? Math.max(...logs.map(l=>l.end),   thisWEnd)   : thisWEnd;

  base.history = { last_4_weeks: historyWeeks };
  base.integrity = {
    logs_count: logs.length,
    window_start_iso: new Date(winStart).toISOString(),
    window_end_iso: new Date(winEnd).toISOString()
  };

  return JSON.stringify(base, null, 2);
}

async function buildAttachmentV01() {
  const now = Date.now();
  const weekStart = startOfWeek(now);
  const weekEnd   = endOfWeek(now);

  const mf = chrome.runtime.getManifest();
  const version = mf?.version || "1.x";

  const { logs = [], portfolioPrefs = { alias:"student", consent:true } } =
    await A.storageGet(["logs","portfolioPrefs"]);
  const { attachment } = await getSettings();

  // total minutes + top domain for this week
  let totalSec = 0;
  const perDomainMin = new Map();
  const secondsInRange = (l, s, e) => {
    const S = Math.max(l.start, s), E = Math.min(l.end, e);
    return E > S ? Math.floor((E - S) / 1000) : 0;
  };
  for (const l of logs) {
    const sec = secondsInRange(l, weekStart, weekEnd);
    if (sec > 0) {
      totalSec += sec;
      perDomainMin.set(l.domain, (perDomainMin.get(l.domain) || 0) + Math.round(sec/60));
    }
  }
  if (state.active?.start && state.active?.domain) {
    const sec = secondsInRange({ start: state.active.start, end: Date.now(), domain: state.active.domain }, weekStart, weekEnd);
    if (sec > 0) {
      totalSec += sec;
      perDomainMin.set(state.active.domain, (perDomainMin.get(state.active.domain) || 0) + Math.round(sec/60));
    }
  }
  let topDomain = "—", topMin = 0;
  for (const [d, m] of perDomainMin.entries()) { if (m > topMin) { topMin = m; topDomain = d; } }

  // AI score from hours
  const hours = totalSec / 3600;
  const aiScore = calcAiScore(hours);

  const record = {
    version: "0.1",
    subject: {
      alias: portfolioPrefs.alias || "student",
      consent: !!portfolioPrefs.consent
    },
    week: {
      start_iso: new Date(weekStart).toISOString().slice(0,10),
      end_iso:   new Date(weekEnd).toISOString().slice(0,10),
      total_minutes: Math.round(totalSec/60),
      ai_score: aiScore,
      ...(attachment?.includeTopDomain ? { top_domain: topDomain } : {})
    },
    generated_at: new Date().toISOString(),
    export_type: "attachment_v01"
  };

  return JSON.stringify(record, null, 2);
}

async function buildAnalyticsV01() {
  const now = Date.now();
  const thisWStart = startOfWeek(now);
  const thisWEnd   = endOfWeek(now);

  const { logs = [], portfolioPrefs = { alias: "student", consent: true } } =
    await A.storageGet(["logs","portfolioPrefs"]);
  const { analytics, salt } = await getSettings();

  // Start from Weekly Portfolio JSON to ensure parity
  const weeklyJson = await buildPortfolioWeeklyV01();
  /** @type {any} */ const base = JSON.parse(weeklyJson);

  // per-domain (min) for this week (optionally included)
  const perDomainMin = new Map();
  const secondsInRange = (l, s, e) => {
    const S = Math.max(l.start, s), E = Math.min(l.end, e);
    return E > S ? Math.floor((E - S) / 1000) : 0;
  };
  const allLogs = [...logs];
  if (state.active?.start) allLogs.push({ start: state.active.start, end: Date.now(), domain: state.active.domain });

  for (const l of allLogs) {
    const sec = secondsInRange(l, thisWStart, thisWEnd);
    if (sec > 0) perDomainMin.set(l.domain, (perDomainMin.get(l.domain) || 0) + Math.round(sec/60));
  }

  // sessions sample (cap 50, newest first), optionally included
  let sessions = [];
  if (analytics.includeSessions !== false) {
    sessions = [...logs]
      .sort((a,b)=>b.start - a.start)
      .slice(0, 50)
      .map(l => ({
        start_iso: new Date(l.start).toISOString(),
        end_iso:   new Date(l.end).toISOString(),
        domain: l.domain,
        duration_seconds: Math.max(0, Math.round((l.end - l.start)/1000))
      }));
  }

  // pseudonymisation (optional)
  let pseudonymisation = undefined;
  if (analytics.hashAlias) {
    const baseSalt = salt?.perInstitution || (chrome.runtime.id || "ext");
    const user_hash = await sha256Hex(`${baseSalt}::${portfolioPrefs.alias || "student"}`);
    pseudonymisation = { user_hash };
  }

  // Build analytics payload
  const analyticsPayload = {
    schema_version: "0.1",
    export_type: "analytics_v01",
    generated_at: new Date().toISOString(),
    tool: { name: "C.L.A.R.A.", version: chrome.runtime.getManifest().version || "1.x" },
    subject: { alias: portfolioPrefs.alias || "student", consent: !!portfolioPrefs.consent },
    // Bring over the weekly core fields from the Weekly Portfolio
    week: {
      start_iso: base.week_start,
      end_iso:   base.week_end,
      total_minutes: base?.totals?.minutes ?? 0,
      per_day_minutes: Array.isArray(base.weekly_breakdown) ? base.weekly_breakdown.map(x=>x.minutes||0) : undefined,
      ...(analytics.includeDomains !== false ? {
        per_domain_minutes: Object.fromEntries([...perDomainMin.entries()].sort((a,b)=>b[1]-a[1]))
      } : {}),
      top_domain: Object.keys(base?.totals?.by_domain || {})[0] || "—",
      change_vs_prev_week_pct: base.change_vs_prev_week_pct ?? null,
      streak_weeks: base.streak_weeks ?? 0,
      ai_score: base.score ?? 0,
      badge: base.badge || "Healthy"
    },
    history: base.history,               // last_4_weeks
    integrity: base.integrity,           // logs_count, window_start/end
    ...(analytics.includeSessions !== false ? { sessions_sample: sessions } : {}),
    ...(pseudonymisation ? { pseudonymisation } : {}),
    ...(analytics.contextTag ? { context_tag: analytics.contextTag } : {}),
    ...(analytics.validator ? { validator: analytics.validator } : {}),
    };
return JSON.stringify(analyticsPayload, null, 2);
}