/* filepath: pages/student.js */
/* @ts-check
   Simple student page: load portfolio JSON, render key stats and allow download / PNG export.
*/

(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);

  const file = /** @type {HTMLInputElement|null} */($('#file'));
  const btnSample = $('#btnSample');
  const btnCard = /** @type {HTMLButtonElement|null} */($('#btnCard'));
  const btnDownloadJSON = /** @type {HTMLButtonElement|null} */($('#btnDownloadJSON'));
  const fromTeacherBadge = /** @type {HTMLElement|null} */($('#fromTeacherBadge'));
  const rawPre = /** @type {HTMLElement|null} */($('#raw'));

  /** @type {any|null} */
  let data = null;
  /** @type {Record<string,string>} */
  let LABELS = {};
  const friendly = (key, fallback = "") => LABELS[key] ?? fallback ?? key;

  function validate(d){
    return d && d.version==='0.1' && d.consent===true && typeof d.alias==='string'
      && d.totals && typeof d.totals.minutes === 'number';
  }

  function setData(d, metaMsg){
    data = d; LABELS = d?.friendly || {};
    const metaEl = $('#meta'); if (metaEl) metaEl.textContent = metaMsg || 'Loaded.';
    const content = $('#content'); if (content) content.style.display = "block";
    if (btnCard) btnCard.disabled = false;
    if (btnDownloadJSON) btnDownloadJSON.disabled = false;
    render(d);
  }

  function fmtHM(mins){
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins/60), m = mins%60;
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  function topTool(d){
    const by = d?.totals?.by_domain || {};
    const pair = Object.entries(by).sort((a,b)=>b[1]-a[1])[0];
    return pair ? { name: pair[0], minutes: pair[1] } : null;
  }

  function niceDate(iso){ try{ const dt = new Date(iso); return dt.toLocaleDateString([], { month:'short', day:'numeric' }); }catch{ return iso; } }

  function extractDaily(d){
    const wb = Array.isArray(d.weekly_breakdown) ? d.weekly_breakdown : null;
    if (wb && wb.length===7) return wb.map(x=>Math.max(0, Math.round(x.minutes||0)));
    const avg = Math.round((d.totals.minutes||0)/7);
    return [avg,avg,avg,avg,avg,avg,avg];
  }

  function render(d){
    const title = $('#title');
    if (title) {
      const range = `${niceDate(d.week_start)} – ${niceDate(d.week_end)}`;
      title.textContent = `Week ${range} • ${d.alias}`;
    }

    // These label elements are optional in HTML; only set them if present.
    const L = d.friendly || {};
    const setIf = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setIf('sTotalLabel',  L["totals.minutes"] || "Total this week");
    setIf('sTopLabel',    L["totals.by_domain"] || "Top tool");
    setIf('sScoreLabel',  L["score"] || "AI Score");
    setIf('sMostLabel',   L["most_active_day"] || "Most active day");
    setIf('sChangeLabel', L["change_vs_prev_week_pct"] || "Change vs prev");
    setIf('sStreakLabel', L["streak_weeks"] || "Streak");
    setIf('sBadgeLabel',  L["badge"] || "User type");

    // values
    const put = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    put('sTotal', fmtHM(d.totals.minutes));
    const top = topTool(d);
    put('sTop', top ? top.name : '—');
    put('sScore', String(Math.round(d.score ?? 0)));
    put('sMost', d.most_active_day ? `${niceDate(d.most_active_day.iso)} (${d.most_active_day.minutes}m)` : '—');
    const ch = typeof d.change_vs_prev_week_pct === 'number' ? d.change_vs_prev_week_pct : null;
    put('sChange', ch === null ? '—' : `${ch>=0?'+':''}${ch.toFixed(1)}%`);
    put('sStreak', `${d.streak_weeks ?? 0} week${(d.streak_weeks||0)===1?'':'s'}`);
    put('sBadge', d.badge || '—');

    // chart + caption
    drawBar(/** @type {HTMLCanvasElement|null} */($('#bar')), extractDaily(d));
    const cap = document.querySelector('#barCaption');
    if (cap) cap.textContent = L["weekly_breakdown"] || "Daily usage (minutes)";

    if (rawPre) rawPre.textContent = JSON.stringify(d, null, 2);
  }

  function drawBar(canvasEl, points){
    try {
      if (!canvasEl) return;
      const canvas = canvasEl;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const cssH = canvas.style.height ? parseFloat(canvas.style.height) : (canvas.offsetHeight || 260);
      const W = canvas.width = Math.max(1, Math.floor(canvas.offsetWidth * dpr));
      const H = canvas.height = Math.max(1, Math.floor(cssH * dpr));
      ctx.scale(dpr, dpr);
      ctx.clearRect(0,0,canvas.offsetWidth,cssH);
      if (!points || !points.length) return;
      const max = Math.max(...points,1);
      const slot = canvas.offsetWidth / points.length;
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--chart-bar").trim() || "#9bb3ff";
      points.forEach((v,i)=>{
        const h = (v/max) * (cssH - 20);
        const x = i*slot + slot*0.15;
        ctx.fillRect(x, cssH - h - 10, slot*0.7, h);
      });
    } catch (e) { console.warn("drawBar:", e); }
  }

  // File chooser
  file?.addEventListener('change', async ()=>{
    if (!file.files?.length) return;
    const f = file.files[0];
    try {
      const txt = await f.text();
      const d = JSON.parse(txt);
      if (!validate(d)) { alert('This file is not a valid Portfolio JSON v0.1 (or consent is missing).'); return; }
      setData(d, `Loaded "${f.name}"`);
    } catch (err) { console.error(err); alert('Could not read this file.'); }
  });

  // Sample
  btnSample?.addEventListener('click', ()=>{
    const sample = {
      version:"0.1",
      alias:"student123",
      consent:true,
      week_start:"2025-08-18",
      week_end:"2025-08-24",
      totals:{ minutes:245, by_domain:{ "chatgpt.com":120, "gemini.google.com":80, "perplexity.ai":45 } },
      score:72,
      most_active_day:{ iso:"2025-08-22", minutes:78 },
      change_vs_prev_week_pct:12.5,
      streak_weeks:3,
      badge:"Power User",
      provenance:{ created_at:new Date().toISOString(), device_local_only:true, extension_version:"1.0.8" },
      weekly_breakdown:[
        {day:"Mon",minutes:10},{day:"Tue",minutes:30},{day:"Wed",minutes:44},
        {day:"Thu",minutes:38},{day:"Fri",minutes:78},{day:"Sat",minutes:25},{day:"Sun",minutes:20}
      ]
    };
    setData(sample, 'Sample data loaded.');
  });

  // Export card
  btnCard?.addEventListener('click', ()=>{
    if (!data) { alert('Load a portfolio JSON (or press “Sample”) first.'); return; }
    console.debug('[student] export card clicked');
    downloadCardPNG(data);
  });

  // Download JSON
  btnDownloadJSON?.addEventListener('click', ()=>{
    if (!data) return;
    const a = document.createElement('a');
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    a.href = URL.createObjectURL(blob);
    const dn = (data.alias || 'student');
    const dt = (data.week_end || '').slice(0,10);
    a.download = `portfolio_${dn}_${dt||'week'}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 500);
  });

  function downloadCardPNG(d){
  try {
    // Canvas
    const W = 800, H = 420, P = 18, r = 14;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) { console.warn("downloadCardPNG: no 2d context"); return; }
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    // CSS palette
    const css  = getComputedStyle(document.body);
    const bg   = css.getPropertyValue("--bg").trim()        || "#0b1220";
    const ink  = css.getPropertyValue("--ink").trim()       || "#e5e7eb";
    const mut  = css.getPropertyValue("--ink-muted").trim() || "#9ca3af";
    const line = css.getPropertyValue("--line").trim()      || "rgba(148,163,184,0.28)";
    const card = css.getPropertyValue("--card").trim()      || "#111827";
    const brand= css.getPropertyValue("--brand").trim()     || "#3a7afe";

    // Helpers
    const measure = (txt, font)=>{ ctx.save(); ctx.font = font; const w = ctx.measureText(txt).width; ctx.restore(); return w; };
    const nice = (iso)=> { try { return new Date(iso).toLocaleDateString([], { month:'short', day:'numeric' }); } catch { return iso||''; } };
    const rangeStr = `${nice(d.week_start)} – ${nice(d.week_end)}`;
    const fmtHM = (mins)=>{
      mins = Math.max(0, Math.round(mins||0));
      const h = Math.floor(mins/60), m = mins%60;
      return h ? `${h}h ${m}m` : `${m}m`;
    };

    // BG + card
    ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
    roundRect(ctx, P, P, W-2*P, H-2*P, r);
    ctx.fillStyle = card; ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();

    const LEFT = P + 22;
    const BOTTOM = H - P - 12;
    let y = P + 30;

    // Title
    ctx.fillStyle = ink;
    ctx.font = "700 22px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.fillText("Responsible AI Portfolio", LEFT, y);

    // Subtitle: alias + range
    y += 20;
    ctx.fillStyle = mut;
    ctx.font = "600 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.fillText(`${d.alias || 'student'} • ${rangeStr}`, LEFT, y);

    // Big total
    y += 36;
    ctx.fillStyle = ink;
    ctx.font = "800 38px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.fillText(fmtHM(d.totals?.minutes || 0), LEFT, y);

    // Caption
    y += 16;
    ctx.fillStyle = mut;
    ctx.font = "400 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    const L = d.friendly || {};
    ctx.fillText(L["totals.minutes"] || "Total this week", LEFT, y);

    // Bullets
    y += 28;
    ctx.font = "400 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    const bullets = [];

    // Most active
    if (d.most_active_day && d.most_active_day.iso) {
      bullets.push(`Most active: ${nice(d.most_active_day.iso)} (${Math.round(d.most_active_day.minutes||0)}m)`);
    } else {
      bullets.push("Most active: —");
    }

    // Change vs prev
    if (typeof d.change_vs_prev_week_pct === "number" && isFinite(d.change_vs_prev_week_pct)) {
      const sign = d.change_vs_prev_week_pct >= 0 ? "+" : "−";
      bullets.push(`Change vs prev: ${sign}${Math.abs(d.change_vs_prev_week_pct).toFixed(1)}%`);
    } else {
      bullets.push("Change vs prev: —");
    }

    // Streak + badge
    const sw = d.streak_weeks ?? 0;
    bullets.push(`Streak: ${sw} week${sw===1?"":"s"} • Badge: ${d.badge || "—"}`);

    ctx.fillStyle = mut;
    bullets.forEach((t,i)=> ctx.fillText("• " + t, LEFT, y + i*22));

    // Brand footer (left)
    ctx.fillStyle = brand;
    ctx.font = "600 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.fillText("C.L.A.R.A. • Local-only", LEFT, BOTTOM);

    // Small print (right)
    ctx.fillStyle = mut;
    ctx.font = "400 11px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    const ver = (typeof chrome !== "undefined"
        && chrome.runtime
        && typeof chrome.runtime.getManifest === "function"
        && chrome.runtime.getManifest()?.version) || "1.x";
    const gen = new Date().toISOString().slice(0,16).replace("T"," ");
    const consentTxt = (d.consent===false) ? "consent: no" : "consent: yes";
    const small = `${d.alias || 'student'} • ${consentTxt} • generated ${gen} • v${ver}`;
    const tw = measure(small, ctx.font);
    ctx.fillText(small, W - P - 22 - tw, BOTTOM);

    // ---- Download (robust with fallbacks)
    const dn = (d.alias || 'student');
    const dt = (d.week_end || '').slice(0,10) || new Date().toISOString().slice(0,10);
    const filename = `portfolio_card_${dn}_${dt}.png`;

    const doDownload = (href) => {
      // try an <a download>
      try {
        const a = document.createElement('a');
        a.download = filename;
        a.rel = 'noopener';
        a.href = href;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        console.warn('anchor download failed, opening in new tab', err);
        try { window.open(href, '_blank'); } catch {}
      }
      if (href.startsWith('blob:')) setTimeout(()=>URL.revokeObjectURL(href), 1000);
    };

    if (c.toBlob) {
      c.toBlob((blob)=>{
        if (!blob) { console.warn('toBlob returned null'); doDownload(c.toDataURL('image/png')); return; }
        const url = URL.createObjectURL(blob);
        doDownload(url);
      }, 'image/png');
    } else {
      doDownload(c.toDataURL('image/png'));
    }
  } catch (e) { console.warn("downloadCardPNG:", e); }
}

  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  // Initialize from Teacher (sessionStorage) if present
  (function preloadFromTeacher(){
    try{
      const fromTeacher = (location.hash||'').includes('from=teacher');
      const raw = sessionStorage.getItem('aiu:portfolio');
      if (fromTeacher && raw){
        const d = JSON.parse(raw);
        if (validate(d)) {
          setData(d, 'Loaded from Teacher.');
          if (fromTeacherBadge) fromTeacherBadge.style.display = 'inline-block';
        }
      }
    }catch{}
  })();

})();