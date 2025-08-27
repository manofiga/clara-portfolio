/* filepath: pages/teacher.js */
/* @ts-check
   Teacher page: ingest student portfolio JSON files (local-only) and render aggregate view + charts.
*/

(() => {
  'use strict';

  const $ = (s)=>document.querySelector(s);
  const esc = (s)=>String(s||"").replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /** @type {Array<{alias:string,score:number,minutes:number,top:string,streak:number,raw:any}>} */
  let students = [];
  /** @type {Record<string,string>} */
  let LABELS = {};
  let sortState = { k:'alias', dir:'asc' };
  let term = '';

  // Elements
  const files = /** @type {HTMLInputElement|null} */($('#files'));
  const drop  = /** @type {HTMLElement|null} */(document.getElementById('drop'));
  const btnCSV     = /** @type {HTMLButtonElement|null} */($('#btnCSV'));
  const btnJSON    = /** @type {HTMLButtonElement|null} */($('#btnJSON'));
  const btnPNG     = /** @type {HTMLButtonElement|null} */($('#btnPNG'));
  const btnCopyPNG = /** @type {HTMLButtonElement|null} */($('#btnCopyPNG'));
  const btnSample  = /** @type {HTMLButtonElement|null} */($('#btnSample'));
  const btnClear   = /** @type {HTMLButtonElement|null} */($('#btnClear'));

  const sCount   = /** @type {HTMLElement|null} */($('#sCount'));
  const sMedian  = /** @type {HTMLElement|null} */($('#sMedian'));
  const sAvgMin  = /** @type {HTMLElement|null} */($('#sAvgMin'));
  const sTopTools= /** @type {HTMLElement|null} */($('#sTopTools'));

  // NEW overview stat IDs
  const stCount      = /** @type {HTMLElement|null} */($('#stCount'));
  const stTotalMin   = /** @type {HTMLElement|null} */($('#stTotalMin'));
  const stAvgMin     = /** @type {HTMLElement|null} */($('#stAvgMin'));
  const stMedianScore= /** @type {HTMLElement|null} */($('#stMedianScore'));
  const stAvgScore   = /** @type {HTMLElement|null} */($('#stAvgScore'));

  const canMinutes = /** @type {HTMLCanvasElement|null} */(document.getElementById('tMinutes'));
  const canScores  = /** @type {HTMLCanvasElement|null} */(document.getElementById('tScores'));
  const canTools   = /** @type {HTMLCanvasElement|null} */(document.getElementById('tTools'));

  function setEnabled(el, on){ if (el) el.disabled = !on; }

  function downloadBlob(blob, filename){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 500);
  }

  function valid(d){
    return d && d.version==='0.1' && typeof d.alias==='string' && typeof d.totals?.minutes==='number';
  }
  function topToolOf(d){
    const byDom = d?.totals?.by_domain || {};
    const pair = Object.entries(byDom).sort((a,b)=>b[1]-a[1])[0];
    return pair ? { name: pair[0], minutes: pair[1] } : null;
  }

  function normalizeToStudentRecords(any) {
    if (any && any.version === '0.1' && Array.isArray(any.students)) {
      return any.students.map(s => ({
        alias: s.alias || 'student',
        score: Math.round(Number(s.score)||0),
        minutes: Math.round(Number(s.minutes)||0),
        top: s.top || '—',
        streak: Math.round(Number(s.streak)||0),
        raw: {
          version:'0.1',
          alias: s.alias || 'student',
          consent:true,
          totals:{ minutes: Math.round(Number(s.minutes)||0),
                   by_domain: s.top && s.top !== '—' ? { [s.top]: Math.round(Number(s.minutes)||0) } : {} },
          score: Math.round(Number(s.score)||0),
          streak_weeks: Math.round(Number(s.streak)||0)
        }
      }));
    }

    const norm = (function toV01(any){
      if (valid(any)) return any;
      if (any && typeof any === 'object') {
        const alias = any.alias || any.user || any.profile?.alias || 'student';
        const minutes =
          (any.totals && typeof any.totals.minutes === 'number') ? any.totals.minutes :
          (typeof any.minutes === 'number') ? any.minutes : 0;
        const by = any.totals?.by_domain || any.by_domain || {};
        const score = Number(any.score)||0;
        const streak = Number(any.streak_weeks || any.streak || 0)||0;

        return {
          version:'0.1',
          alias, consent:true,
          totals:{ minutes: Number(minutes)||0, by_domain: by||{} },
          score,
          streak_weeks: streak,
          week_start: any.week_start || any.range?.start || '',
          week_end:   any.week_end   || any.range?.end   || '',
          friendly: any.friendly
        };
      }
      return null;
    })(any);

    if (!norm) return [];
    const tt = topToolOf(norm);
    return [{
      alias: norm.alias,
      score: Math.round(norm.score||0),
      minutes: Math.round(norm.totals?.minutes||0),
      top: tt?.name || '—',
      streak: norm.streak_weeks || 0,
      raw: norm
    }];
  }

  async function ingest(fileList){
    const byAlias = new Map(students.map(s=>[s.alias,s]));
    for (const f of fileList){
      if(!f.name.toLowerCase().endsWith('.json')) continue;
      try{
        const txt = await f.text();
        let any;
        try { any = JSON.parse(txt); }
        catch { console.warn('Skipped (not JSON):', f.name); continue; }
        const rows = normalizeToStudentRecords(any);
        for (const s of rows) byAlias.set(s.alias, s);
      }catch(err){ console.warn('Skipped', f.name, err); }
    }
    students = Array.from(byAlias.values());
    refreshAll();
  }

  // File input + DnD
  files?.addEventListener('change', async ()=>{
    if(!files.files?.length) return;
    await ingest(Array.from(files.files));
  });

  if (drop) {
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter','dragover','dragleave','drop'].forEach(ev => {
      drop.addEventListener(ev, prevent);
      document.addEventListener(ev, prevent);
    });
    drop.addEventListener('dragenter', ()=>drop.classList.add('dragover'));
    drop.addEventListener('dragover',  ()=>drop.classList.add('dragover'));
    drop.addEventListener('dragleave', ()=>drop.classList.remove('dragover'));
    drop.addEventListener('drop', async (e) => {
      drop.classList.remove('dragover');
      const dt = e.dataTransfer;
      if (!dt || !dt.files?.length) return;
      await ingest(Array.from(dt.files));
    });
  }

  function refreshAll(){
    summarize();
    renderTable();
    renderCharts();
    const has = students.length>0;
    setEnabled(btnCSV, has);
    setEnabled(btnJSON, has);
    setEnabled(btnPNG, has);
    setEnabled(btnCopyPNG, has);
    setEnabled(btnClear, has);
    try{ localStorage.setItem('aiu:class', JSON.stringify(students)); }catch{}
  }

  // ===== Stats & table =====
  function summarize(){
    const count = students.length;
    if (sCount) sCount.textContent = String(count);
    if (stCount) stCount.textContent = String(count);

    const totalMin = students.reduce((a,s)=>a+(Number(s.minutes)||0),0);
    if (stTotalMin) stTotalMin.textContent = String(totalMin);

    const avgMin = count ? Math.round(totalMin / count) : 0;
    if (sAvgMin) sAvgMin.textContent = String(avgMin);
    if (stAvgMin) stAvgMin.textContent = String(avgMin);

    const scores = students.map(s=>Number(s.score)||0).sort((a,b)=>a-b);
    const median = scores.length
      ? (scores.length%2 ? scores[(scores.length-1)/2]
         : Math.round((scores[scores.length/2-1]+scores[scores.length/2])/2))
      : '—';
    if (sMedian) sMedian.textContent = String(median);
    if (stMedianScore) stMedianScore.textContent = String(median);

    const avgScore = count ? Math.round(scores.reduce((a,b)=>a+b,0)/count) : 0;
    if (stAvgScore) stAvgScore.textContent = String(avgScore);

    const map = new Map();
    students.forEach(s=>{
      const t = topToolOf(s.raw);
      if (t) map.set(t.name, (map.get(t.name)||0)+1);
    });
    const top5 = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>e[0]);
    if (sTopTools) sTopTools.textContent = top5.length ? top5.join(', ') : '—';
  }

  function getOrdered(){
    const arr = students.slice();
    arr.sort((a,b)=>{
      const ka = /** @type {any} */(a)[sortState.k], kb = /** @type {any} */(b)[sortState.k];
      if (ka < kb) return sortState.dir === 'asc' ? -1 : 1;
      if (ka > kb) return sortState.dir === 'asc' ?  1 : -1;
      return 0;
    });
    return arr;
  }

  function getFiltered(){
    const q = (term||"").toLowerCase().trim();
    return getOrdered().filter(s => !q || s.alias.toLowerCase().includes(q));
  }

  function renderTable(){
    const list = getFiltered();
    const tbody = /** @type {HTMLElement} */($('#tbl tbody'));
    const emptyMsg = /** @type {HTMLElement} */($('#emptyMsg'));
    if (!tbody || !emptyMsg) return;

    // Update column headers from friendly map, if any
    const labels = (students[0]?.raw?.friendly) || {};
    const thead = document.querySelector('#tbl thead');
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>${labels["alias"] || "Alias"}</th>
          <th>${labels["score"] || "Score"}</th>
          <th>${labels["totals.minutes"] || "Minutes"}</th>
          <th>${labels["totals.by_domain"] || "Top tool"}</th>
          <th>${labels["streak_weeks"] || "Streak"}</th>
        </tr>`;
    }

    tbody.innerHTML = '';
    if (!list.length) {
      emptyMsg.style.display = 'block';
      return;
    }
    emptyMsg.style.display = 'none';

    for (const s of list){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(s.alias)}</td>
        <td>${s.score}</td>
        <td>${s.minutes}</td>
        <td>${esc(s.top)}</td>
        <td>${s.streak}</td>
      `;
      tr.style.cursor = 'pointer';
      tr.title = 'Open student portfolio';
      tr.addEventListener('click', ()=>{
        try { sessionStorage.setItem('aiu:portfolio', JSON.stringify(s.raw)); } catch {}
        const url = chrome.runtime.getURL('pages/student.html') + '#from=teacher';
        window.open(url, '_blank');
      });
      tbody.appendChild(tr);
    }
  }

  // ===== Charts =====
  function getColors(){
    const css = getComputedStyle(document.body);
    return {
      bg:   css.getPropertyValue('--bg').trim() || '#ffffff',
      card: css.getPropertyValue('--card').trim() || '#f8fafc',
      ink:  css.getPropertyValue('--ink').trim() || '#111827',
      line: css.getPropertyValue('--line').trim() || '#e5e7eb',
      bar:  css.getPropertyValue('--chart-bar').trim() || '#9bb3ff',
      brand:css.getPropertyValue('--brand').trim() || '#3a7afe'
    };
  }

  function setupCanvas(c){
    if (!c) return null;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 600;
    const cssH = c.clientHeight || 200;
    c.width  = Math.max(1, Math.floor(cssW * dpr));
    c.height = Math.max(1, Math.floor(cssH * dpr));
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return { ctx, w: cssW, h: cssH };
    }

  function barChart(c, labels, values){
    const S = setupCanvas(c); if (!S) return;
    const { ctx, w, h } = S; const col = getColors();
    ctx.clearRect(0,0,w,h);
    const max = Math.max(1, ...values);
    const pad = 28, gap = 8;
    const innerW = w - pad*2, innerH = h - pad*2;
    const slot = innerW / values.length;

    // axis
    ctx.strokeStyle = col.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, h-pad); ctx.lineTo(w-pad, h-pad); ctx.stroke();

    // bars
    ctx.fillStyle = col.bar;
    values.forEach((v,i)=>{
      const bh = Math.round((v/max) * innerH);
      const x = pad + i*slot + slot*0.15;
      ctx.fillRect(x, h-pad-bh, slot*0.7, bh);
      // x labels (small)
      ctx.fillStyle = col.ink; ctx.font='11px system-ui,Segoe UI,Roboto';
      ctx.textAlign='center';
      ctx.fillText(labels[i], pad + i*slot + slot/2, h-6);
      ctx.fillStyle = col.bar;
    });
  }

  function hBarChart(c, labels, values){
    const S = setupCanvas(c); if (!S) return;
    const { ctx, w, h } = S; const col = getColors();
    ctx.clearRect(0,0,w,h);
    const max = Math.max(1, ...values);
    const pad = 28, rowH = Math.min(28, (h - pad*2) / values.length - 4);

    labels.forEach((lab,i)=>{
      const v = values[i];
      const y = pad + i*(rowH+8);
      const barW = Math.round(((w - pad*2) * v)/max);
      ctx.fillStyle = col.bar;
      ctx.fillRect(pad, y, barW, rowH);
      ctx.fillStyle = col.ink; ctx.font='12px system-ui,Segoe UI,Roboto';
      ctx.textBaseline='middle';
      ctx.fillText(`${lab} (${v})`, pad+6, y + rowH/2);
    });
  }

  function histogram(c, values){
    const S = setupCanvas(c); if (!S) return;
    const { ctx, w, h } = S; const col = getColors();
    ctx.clearRect(0,0,w,h);

    const bins = [0,20,40,60,80,100];
    const counts = new Array(bins.length-1).fill(0);
    values.forEach(v=>{
      const idx = Math.min(bins.length-2, Math.max(0, Math.floor(v/20)));
      counts[idx]++;
    });

    const labels = ['0–19','20–39','40–59','60–79','80–100'];
    barChart(c, labels, counts); // reuse barChart logic
  }

  function renderCharts(){
    // Minutes per student (top 10)
    const sorted = students.slice().sort((a,b)=>b.minutes-a.minutes).slice(0,10);
    barChart(canMinutes, sorted.map(s=>s.alias), sorted.map(s=>s.minutes));

    // Score distribution
    histogram(canScores, students.map(s=>s.score||0));

    // Top tools
    const map = new Map();
    students.forEach(s=>{
      const t = topToolOf(s.raw); if (!t) return;
      map.set(t.name, (map.get(t.name)||0)+1);
    });
    const pairs = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,8);
    hBarChart(canTools, pairs.map(p=>p[0]), pairs.map(p=>p[1]));
  }

  // Buttons
  btnSample?.addEventListener('click', ()=>{
    const mk = (alias, score, minutes, top, streak)=>({
      alias, score, minutes, top, streak,
      raw:{
        version:'0.1', alias, consent:true,
        totals:{ minutes, by_domain:{[top]: minutes}},
        score, streak_weeks: streak,
        week_start:'2025-08-18', week_end:'2025-08-24'
      }
    });
    students = [
      mk('alex',65,190,'gemini.google.com',2),
      mk('maria',88,120,'perplexity.ai',4),
      mk('jo',41,95,'claude.ai',1),
      mk('sam',55,160,'chatgpt.com',1),
    ];
    refreshAll();
  });

  btnClear?.addEventListener('click', ()=>{
    students = [];
    refreshAll();
    try{ localStorage.removeItem('aiu:class'); }catch{}
  });

  btnCSV?.addEventListener('click', ()=>{
    const ordered = getFiltered();
    const L = students[0]?.raw?.friendly || {};
    const rows = [[
      L["alias"] || "Alias",
      L["score"] || "Score",
      L["totals.minutes"] || "Total minutes",
      L["totals.by_domain"] || "Top tool",
      L["streak_weeks"] || "Streak"
    ]].concat(ordered.map(s=>[s.alias,s.score,s.minutes,s.top,s.streak]));
    const csv = rows.map(r=>r.map(v=>String(v).includes(',')?`"${v}"`:v).join(',')).join('\n');
    downloadBlob(new Blob([csv],{type:'text/csv'}),'class-summary.csv');
  });

  btnJSON?.addEventListener('click', ()=>{
    const agg = {
      version:'0.1',
      created_at: new Date().toISOString(),
      students: students.map(({alias,score,minutes,top,streak})=>({alias,score,minutes,top,streak})),
      friendly: students[0]?.raw?.friendly || undefined
    };
    downloadBlob(new Blob([JSON.stringify(agg,null,2)],{type:'application/json'}),'class-aggregate.json');
  });

  btnPNG?.addEventListener('click', ()=>{
  exportClassReportPNG(students);
});

/* ========= Class Report PNG ========= */
function exportClassReportPNG(students){
  if (!students || !students.length) { alert("Load some portfolios first."); return; }

  // ---- CSS palette
  const css = getComputedStyle(document.body);
  const bg    = css.getPropertyValue("--bg").trim()          || "#0b1220";
  const ink   = css.getPropertyValue("--ink").trim()         || "#e5e7eb";
  const muted = css.getPropertyValue("--ink-muted").trim()   || "#9ca3af";
  const line  = css.getPropertyValue("--line").trim()        || "rgba(148,163,184,0.28)";
  const card  = css.getPropertyValue("--card").trim()        || "#111827";
  const bar   = css.getPropertyValue("--chart-bar").trim()   || "#9bb3ff";
  const brand = css.getPropertyValue("--brand").trim()       || "#3a7afe";

  // ---- Canvas
  const W = 1200, H = 700, P = 24, r = 16;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"); if (!ctx) return;
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";

  // ---- Helpers
  const measure = (txt, font)=>{ ctx.save(); ctx.font = font; const w = ctx.measureText(txt).width; ctx.restore(); return w; };
  const rr = (x,y,w,h,R)=>{ ctx.beginPath(); ctx.moveTo(x+R,y); ctx.arcTo(x+w,y,x+w,y+h,R); ctx.arcTo(x+w,y+h,x,y+h,R); ctx.arcTo(x,y+h,x,y,R); ctx.arcTo(x,y,x+w,y,R); ctx.closePath(); };
  const fmtHM = (m)=>{ m=Math.max(0,Math.round(m)); const h=Math.floor(m/60), mm=m%60; return h?`${h}h ${mm}m`:`${mm}m`; };
  const rightAlign = (txt, x, y, font)=>{ ctx.save(); ctx.font = font; const w = ctx.measureText(txt).width; ctx.restore(); ctx.fillText(txt, x - w, y); };

  // ---- Aggregate
  const count = students.length;
  const minutes = students.map(s=>Number(s.minutes)||0);
  const totalMin = minutes.reduce((a,b)=>a+b,0);
  const avgMin = count ? Math.round(totalMin/count) : 0;

  const scores = students.map(s=>Number(s.score)||0).sort((a,b)=>a-b);
  const avgScore = count ? Math.round(scores.reduce((a,b)=>a+b,0)/count) : 0;
  const medianScore = scores.length ? (scores.length%2 ? scores[(scores.length-1)/2] : Math.round((scores[scores.length/2-1]+scores[scores.length/2])/2)) : 0;

  const streak3 = students.filter(s => (Number(s.streak)||0) >= 3).length;

  // mode week range (best effort)
  const mode = (arr)=>{ const m=new Map(); arr.forEach(v=>v&&m.set(v,(m.get(v)||0)+1)); return [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]; };
  const nice = (iso)=>{ try{ return new Date(iso).toLocaleDateString([], { month:"short", day:"numeric" }); }catch{ return iso||""; } };
  const wkStart = mode(students.map(s=>s.raw?.week_start));
  const wkEnd   = mode(students.map(s=>s.raw?.week_end));
  const rangeStr = (wkStart && wkEnd) ? `${nice(wkStart)} – ${nice(wkEnd)}` : "";

  // top tools
  const toolCounts = new Map();
  students.forEach(s=>{
    const by = s.raw?.totals?.by_domain || {};
    const top = Object.entries(by).sort((a,b)=>b[1]-a[1])[0];
    if (top) toolCounts.set(top[0], (toolCounts.get(top[0])||0)+1);
  });
  const topTools = [...toolCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7);

  // leaderboards
  const top10Minutes = students.slice().sort((a,b)=>(b.minutes||0)-(a.minutes||0)).slice(0,10);
  const top5Score    = students.slice().sort((a,b)=> (b.score||0)-(a.score||0) || (b.minutes||0)-(a.minutes||0)).slice(0,5);
  const needsHelp    = students.filter(s=>(s.score||0)<50).sort((a,b)=> (a.score||0)-(b.score||0) || (b.minutes||0)-(a.minutes||0)).slice(0,5);

  // score histogram (0–19,20–39,40–59,60–79,80–100)
  const bins = [0,20,40,60,80,101];
  const labelsBins = ['0–19','20–39','40–59','60–79','80–100'];
  const counts = new Array(5).fill(0);
  students.forEach(s=>{
    const v = Math.max(0, Math.min(100, Number(s.score)||0));
    const idx = bins.findIndex((b,i)=> v>=bins[i] && v<bins[i+1]) - 0;
    if (idx>=0) counts[idx] += 1;
  });

  // ---- Background & card
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
  rr(P,P,W-2*P,H-2*P,r); ctx.fillStyle = card; ctx.fill();
  ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();

  const LEFT = P + 26, RIGHT = W - P - 26;
  let y = P + 40;

  // ---- Title + range
  ctx.fillStyle = ink; ctx.font = "700 28px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.fillText("Class Portfolio — Weekly Summary", LEFT, y);
  if (rangeStr){ y += 20; ctx.fillStyle = muted; ctx.font = "600 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif"; ctx.fillText(rangeStr, LEFT, y); }

  // ---- KPI row (6 tiles)
  y += 26;
  const kY = y, kH = 86, gap = 14;
  const kCols = [
    { label:"Students", value:String(count) },
    { label:"Total minutes", value:fmtHM(totalMin) },
    { label:"Avg minutes", value:fmtHM(avgMin) },
    { label:"Median score", value:String(medianScore) },
    { label:"Avg score", value:String(avgScore) },
    { label:"Streak ≥ 3w", value:String(streak3) },
  ];
  const kW = Math.floor((W - LEFT - (W-RIGHT) - gap*(kCols.length-1)) / kCols.length);
  kCols.forEach((col,i)=>{
    const x = LEFT + i*(kW+gap);
    rr(x, kY, kW, kH, 12); ctx.fillStyle = "transparent"; ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = muted; ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.fillText(col.label, x+12, kY+24);
    ctx.fillStyle = ink; ctx.font = "800 24px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    let v = col.value; const maxW = kW-24; while (measure(v, ctx.font) > maxW && v.length>3) v = v.slice(0,-4)+"…";
    ctx.fillText(v, x+12, kY+54);
  });

  // ---- Below layout: Left (Top-10 minutes), Right (Score histogram + Top tools)
  const contentY = kY + kH + 26;

  // Left block
  const leftW = Math.floor((W - LEFT - (W-RIGHT) - 22) * 0.62);
  ctx.fillStyle = muted; ctx.font = "700 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.fillText("Top 10 students by minutes", LEFT, contentY);
  {
    const x0 = LEFT, y0 = contentY + 12;
    const rowH = 22, pad = 10, chartH = rowH*top10Minutes.length + pad*2, labelW = 160;
    rr(x0, y0, leftW, chartH, 10); ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();

    const maxMin = Math.max(1, ...top10Minutes.map(s=>s.minutes||0));
    let yRow = y0 + pad;
    top10Minutes.forEach(s=>{
      const v = Math.max(0, s.minutes||0);
      const bw = Math.round(((leftW - labelW - 40) * v)/maxMin);
      // bar
      ctx.fillStyle = bar; ctx.fillRect(x0 + labelW + 8, yRow + 5, bw, rowH-10);
      // alias
      ctx.fillStyle = ink; ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
      let alias = String(s.alias||"student"); const maxAL = labelW - 12; while (measure(alias, ctx.font) > maxAL && alias.length>3) alias = alias.slice(0,-4)+"…";
      ctx.fillText(alias, x0 + 8, yRow + rowH - 7);
      // minutes right aligned
      ctx.fillStyle = muted; rightAlign(`${Math.round(v)}m`, x0 + leftW - 10, yRow + rowH - 7, "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif");
      yRow += rowH;
    });
  }

  // Right stack column
  const rightX = LEFT + leftW + 22;
  // 1) Score histogram
  ctx.fillStyle = muted; ctx.font = "700 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.fillText("Score distribution", rightX, contentY);
  {
    const x0 = rightX, y0 = contentY + 12;
    const w0 = RIGHT - rightX, h0 = 150, pad = 12;
    rr(x0, y0, w0, h0, 10); ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();
    const innerW = w0 - pad*2, innerH = h0 - pad*2;
    const maxC = Math.max(1, ...counts);
    const slot = innerW / counts.length;
    for (let i=0;i<counts.length;i++){
      const bh = Math.round((counts[i]/maxC) * (innerH - 20));
      const x = x0 + pad + i*slot + slot*0.15;
      const yb = y0 + pad + (innerH - bh);
      ctx.fillStyle = bar; ctx.fillRect(x, yb, slot*0.7, bh);
      ctx.fillStyle = muted; ctx.font = "600 11px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(labelsBins[i], x + slot*0.35, y0 + h0 - 6);
      ctx.textAlign = "left";
    }
  }
  // 2) Top tools
  const toolsY = contentY + 12 + 150 + 16;
  ctx.fillStyle = muted; ctx.font = "700 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.fillText("Top tools this week (by students)", rightX, toolsY);
  {
    let ly = toolsY + 18;
    const rowH = 22; const w0 = RIGHT - rightX;
    if (topTools.length === 0){
      ctx.fillStyle = muted; ctx.font = "400 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
      ctx.fillText("—", rightX, ly);
    } else {
      topTools.forEach(([tool, cnt])=>{
        ctx.beginPath(); ctx.arc(rightX + 6, ly - 6, 3, 0, Math.PI*2); ctx.fillStyle = brand; ctx.fill();
        ctx.fillStyle = ink; ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
        let label = tool; const maxW = w0 - 60; while (measure(label, ctx.font) > maxW && label.length>3) label = label.slice(0,-4)+"…";
        ctx.fillText(label, rightX + 16, ly);
        ctx.fillStyle = muted; rightAlign(String(cnt), rightX + w0 - 6, ly, "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif");
        ly += rowH;
      });
    }
  }

  // ---- Bottom: two mini tables (Top performers / Needs attention)
  const botY = H - P - 150;
  const sectionH = 110;
  const colW = Math.floor((RIGHT - LEFT - 22) / 2);

  const drawList = (title, rows, x0)=>{
    ctx.fillStyle = muted; ctx.font = "700 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    ctx.fillText(title, x0, botY);
    rr(x0, botY + 10, colW, sectionH, 10); ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();
    let y = botY + 10 + 24;
    rows.forEach(r=>{
      ctx.fillStyle = ink; ctx.font = "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
      let alias = String(r.alias||"student"); const maxA = colW - 120; while (measure(alias, ctx.font) > maxA && alias.length>3) alias = alias.slice(0,-4)+"…";
      ctx.fillText(alias, x0 + 10, y);
      ctx.fillStyle = muted; rightAlign(`${r.score ?? 0}`, x0 + colW - 64, y, "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif");
      rightAlign(`${Math.round(r.minutes||0)}m`, x0 + colW - 12, y, "600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif");
      y += 20;
    });
  };

  drawList("Top performers (score)", top5Score, LEFT);
  drawList("Needs attention (score < 50)", needsHelp, LEFT + colW + 22);

  // ---- Footer
  const bottomY = H - P - 14;
  ctx.fillStyle = brand; ctx.font = "600 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  ctx.fillText("C.L.A.R.A. • Local-only", LEFT, bottomY);

  ctx.fillStyle = muted; ctx.font = "400 11px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  const ver = (typeof chrome!=="undefined" && chrome.runtime && typeof chrome.runtime.getManifest==="function" && chrome.runtime.getManifest()?.version) || "1.x";
  const gen = new Date().toISOString().slice(0,16).replace("T"," ");
  const small = `${count} students • generated ${gen} • v${ver}`;
  const sw = measure(small, ctx.font);
  ctx.fillText(small, RIGHT - sw, bottomY);

  // ---- Download (blob URL)
  const filename = `class_report_${new Date().toISOString().slice(0,10)}.png`;
  if (c.toBlob) {
    c.toBlob((blob)=>{
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.download = filename; a.href = url; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  } else {
    const a = document.createElement('a'); a.download = filename; a.href = c.toDataURL('image/png'); a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }
}

})();