TODO — Responsible AI Portfolio (MVP+ Stabilization)

Non‑negotiables: keep current UI/UX and visual design as‑is. This sprint focuses on correctness, stability, and pilot readiness.

Legend
	•	[B] Blocker, [M] Must‑have, [N] Nice‑to‑have
	•	AC = Acceptance Criteria
	•	Files: manifest.json, background.js, heartbeat.js, popup.html, popup.js, styles.css, pages/student.html, pages/student.js, pages/teacher.html, pages/teacher.js, assets/schema-portfolio-v0_1.json, icons/*.

⸻

1) Tracking Accuracy & Data Model
	•	[B] Debounced heartbeats
	•	AC: No duplicate “micro‑beats” within debounce window; background state updates once per active tab within 5s tick.
	•	Verify: live counter increments smoothly; idle after 60s inactivity.
	•	[B] Micro‑session merge (merge contiguous sessions per domain when gap < 2 min)
	•	AC: Logs show merged blocks; total minutes match dashboard.
	•	[M] Strict domain matching with legacy “contains” fallback
	•	AC: Rule type persisted; “Why I’m tracked” shows match reason.

2) Storage & Performance
	•	[B] Batch writes to storage (no per‑second writes)
	•	AC: Writes at most once per tick or on state change; no thrash.
	•	[M] Prune old logs in memory (keep last 90 days in RAM; archive older in storage if needed)
	•	AC: Popup stays responsive; memory stable over 30 min usage.
	•	[M] Single interval + listener hygiene (no duplicate intervals on reload)
	•	AC: Only one badge/heartbeat interval; removing/adding listeners on init/dispose verified.

3) Report Tab (MVP+ math)
	•	[B] AI Score (deterministic, documented formula)
	•	AC: Same input → same score; rounded; shown in Report tab + info modal.
	•	[M] Most active day (last 7 days)
	•	AC: Displays weekday + minutes; ties handled.
	•	[M] % change vs last week
	•	AC: Handles divide‑by‑zero; shows up/down/flat.
	•	[M] Average daily time (week total / 7)
	•	AC: Correct with zero‑fill for missing days.

4) Export & Send (JSON + PNG)
	•	[B] Portfolio JSON v0.1 conforms to assets/schema-portfolio-v0_1.json
	•	AC: ajv‑style validation passes in dev; includes week window, totals, domains, sessions.
	•	[B] PNG Portfolio Card (canvas render of Report block)
	•	AC: Download button produces .png with correct timestamp.
	•	[B] Local downloads (no extra permission unless used)
	•	AC: downloads permission only present if download path required.
	•	[M] Optional multipart POST (only if consent + HTTPS URL + auto‑send OR manual send)
	•	AC: Enforce HTTPS; timeouts + error toast; retries off by default.

5) Onboarding & Settings (no visual change beyond modal)
	•	[B] Welcome modal once (onboardingComplete=true)
	•	AC: Preload default rules; never reappears after confirm.
	•	[M] Settings wiring (alias, upload URL, consent, auto‑send, badge mode)
	•	AC: Persisted; validation errors inline; Save → toast.
	•	[M] Minimal HTTPS validation for upload URL
	•	AC: Blocks http://, empty, and malformed hosts.

6) Logs & Exports
	•	[M] Logs filtering (by domain, date range, min minutes)
	•	AC: Filters compose; reset clears all.
	•	[M] CSV & JSON export of logs
	•	AC: UTF‑8 BOM; ISO dates; durations in minutes.

7) Dashboards (static, lightweight)
	•	[M] Student dashboard (/pages/student.*)
	•	AC: Mirrors Report metrics + card preview; read‑only; no design changes.
	•	[M] Teacher dashboard (/pages/teacher.*)
	•	AC: Aggregated example data (local mock); privacy note; links to JSON spec.

8) Notifications & Streak
	•	[M] Weekly digest notification (Sunday 18:00 local)
	•	AC: Opens popup Report tab; respects OS/Chrome notification setting.
	•	[N] Streak (consecutive days with > X min)
	•	AC: Streak count visible in Report; resets correctly.

9) UX Stability (keep current visuals)
	•	[B] Tabs & navigation (Back, Open Rules, Why tracked)
	•	AC: All buttons work; ARIA states correct; keyboard focus preserved.
	•	[M] Live second/min counter
	•	AC: Updates every 1s without reflow jank.
	•	[M] Error toasts (exports, POST, permissions)
	•	AC: Non‑blocking; contain retry guidance.

10) Security & Privacy
	•	[B] Data stays local by default
	•	AC: No network calls unless POST explicitly triggered by consent + URL.
	•	[B] Minimized permissions
	•	AC: host_permissions restricted to rules; no wildcards unless necessary.
	•	[M] Input sanitization (alias, URL)
	•	AC: Strip control chars; max length; UI message on reject.
	•	[M] Telemetry off (no hidden analytics)
	•	AC: Code scan verifies no external beacons.

11) Manifest & Packaging
	•	[B] MV3 compliance (service worker life, alarms, notifications)
	•	AC: No background page fallbacks; no DOM APIs in SW.
	•	[M] Icons present (16/32/48)
	•	AC: No 404s; crisp in Chrome toolbar.
	•	[M] Version bump + changelog
	•	AC: Semver increment; release notes list fixes.

⸻

Acceptance Test (Pilot‑ready 11‑point)
	1.	Tracks active AI sites with strict domain match; shows live counter.
	2.	Merges micro‑sessions; totals consistent across Dashboard, Logs, Report.
	3.	Welcome modal shows once; default rules preloaded.
	4.	Report tab shows AI Score, most active day, % vs last week, avg/day.
	5.	“Export & Send” → downloads JSON v0.1 + PNG card locally.
	6.	With consent+HTTPS URL: multipart POST succeeds; without consent: no network call.
	7.	Logs filter works; CSV/JSON exports valid.
	8.	Student/Teacher pages load and display expected data.
	9.	Weekly notification appears Sunday 18:00; opens Report.
	10.	No duplicate intervals/listeners after extension reload; no console errors.
	11.	Permissions minimal; no data leaves device by default.