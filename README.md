# C.L.A.R.A. — Clear Learning & AI Responsibility Assistant ✨📊🔐

by **GG095**

C.L.A.R.A. is a **privacy-first Chrome extension** and **JSON Schema** that helps schools and researchers understand how students engage with AI tools.

Unlike invasive monitoring, C.L.A.R.A. only tracks **time** and **domains** — not prompts, keystrokes, or page contents.  
All data is **100% local** on the student’s device, and exports require explicit consent.

---

## ✨ Features
- **Time Tracking** — accurate minutes on AI tools (ChatGPT, Claude, Gemini, Runway, etc.)
- **Weekly Report Cards** — one-click PNG export with totals, daily usage, top tool, and AI Score
- **Privacy-First** — no keystrokes, no prompts, no page data
- **Education-Ready Exports**
  - **Portfolio JSON v0.1** (full schema, student report)
  - **Weekly Portfolio JSON** (with history & integrity)
  - **Attachment JSON** (minimal export for LMS / email)
  - **Analytics JSON** (richer dataset for researchers)
- **Pilot-Friendly** — lightweight Chrome extension, no servers needed

---

## 📦 Export Types (what each file is for)

> All exports are **opt-in** and generated locally by the student via the **Report** tab buttons.

### 1) Portfolio JSON (v0.1) — *full student report*
- **Schema:** `/schemas/schema-portfolio-v0_1.json`
- **Button:** `Export Portfolio JSON`
- **What’s inside:** week window, totals, minutes by domain, most active day, AI Score, daily breakdown, provenance (created_at, version), optional history sample.
- **Audience:** teachers, counselors, parents.
- **Privacy level:** medium.
- **Use cases:** one-pager evidence for a student portfolio or parent meeting.

### 2) Weekly Portfolio JSON — *week + short history (stable IDs)*
- **Schema:** same structure as Portfolio but with history + integrity fields.
- **Button:** `Export Weekly Portfolio JSON`
- **What’s inside:** adds `history.last_4_weeks` and `integrity` window.
- **Audience:** schools tracking progress over multiple weeks.
- **Privacy level:** medium.
- **Use cases:** weekly check-ins, longitudinal tracking.

### 3) Attachment JSON (v0.1) — *privacy-minimal for LMS/email*
- **Schema:** `/schemas/schema-attachment-v0_1.json`
- **Button:** `Export Attachment JSON`
- **What’s inside:** only alias, consent, week start/end, total minutes, AI Score, and generated_at.
- **Audience:** LMS import, email to teachers/admins.
- **Privacy level:** **high** (no per-domain data, no logs).
- **Use cases:** quick weekly proof without exposing behavior details.

### 4) Analytics JSON — *richer dataset for researchers*
- **Schema:** (coming soon) `/schemas/schema-analytics-v0_1.json`
- **Button:** `Export Analytics JSON`
- **What’s inside:** normalized per-session samples (timestamps, domain, duration seconds), aggregates, optional pseudonymous IDs.
- **Audience:** researchers, data teams, grant evaluators.
- **Privacy level:** medium-high.
- **Use cases:** cohort-level insights (“Which AI tools dominate?”, “How does usage shift during exams?”).

---

## 🔐 Privacy model
- Tracks **time on domains** you list in **Rules**.  
- **No prompts, no keystrokes, no page content.**  
- Data is **100% local**; exports happen only when the student clicks.  
- `subject.alias` is a **tag**, not a real name — mapping is handled off-device by schools.

---

## 🧪 Validation & versioning
- All schemas use **JSON Schema Draft 2020-12**.
- Each file declares its version (e.g., `"version": "0.1"`) and type (e.g., `"export_type": "attachment_v01"`).
- Recommended: validate with any JSON Schema validator before ingesting.

---

## 🗂️ Repo structure
- `/extension` — Chrome MV3 extension code
- `/schemas` — JSON Schemas (portfolio, attachment, analytics)
- `/examples` — Example exports
- `README.md` — this file

---

## 📬 Contact
- Website: *(coming soon)*  
- Email: *(coming soon)*  
- Org: **GG095** — EU-based studio focused on responsible AI tools

---

## 📜 License
MIT License — see [LICENSE](LICENSE).  
Open for academic pilots, feedback, and responsible reuse.
