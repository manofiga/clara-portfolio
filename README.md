# C.L.A.R.A. — Clear Learning & AI Responsibility Assistant  
**by GG095**

C.L.A.R.A. is a **privacy-first Chrome extension** and **JSON Schema** that helps schools and researchers understand how students engage with AI tools.  

Unlike invasive monitoring, C.L.A.R.A. only tracks **time and domains** — not prompts, keystrokes, or page contents.  
All data is **100% local** on the student’s device, and exports require explicit consent.

---

## ✨ Features
- ⏱ **Time Tracking** — accurate minutes on AI tools (ChatGPT, Claude, Gemini, Runway, etc.)  
- 📊 **Weekly Report Cards** — one-click PNG export with totals, daily usage, top tool, and AI Score  
- 🔒 **Privacy-First** — no keystrokes, no prompts, no page data  
- 🎓 **Education-Ready Exports**  
  - **Portfolio JSON v0.1** (full schema, student report)  
  - **Weekly Portfolio JSON** (with history & integrity)  
  - **Attachment JSON** (minimal export for LMS / email)  
  - **Analytics JSON** (richer dataset for researchers)  
- 🛠 **Pilot-Friendly** — lightweight Chrome extension, no servers needed  

---

## 📂 Repository structure
/extension/     → Chrome MV3 extension source
/schemas/       → JSON Schemas (v0.1 and minimal draft)
README.md       → This file

## 📜 Schema draft
See [`schemas/schema-portfolio-v0_1.json`](schemas/schema-portfolio-v0_1.json).  
- Aligned with **JSON Schema Draft 2020-12**  
- Designed for educational pilots, grant applications, and researcher integration.  

---

## 🚀 How to use (MVP)
1. Clone or download this repo  
2. In Chrome → `chrome://extensions` → enable **Developer Mode** → **Load unpacked** → select `/extension` folder  
3. Extension runs locally, tracking AI usage only on domains you add under “Rules”  
4. Use export buttons for PNG or JSON outputs  

---

## 📣 Pilot program 2025–2026
We are seeking **partner schools, universities, and research teams** to test C.L.A.R.A. in real classrooms.  
- Pilot is free during the MVP phase  
- Feedback will directly shape future versions  
- Contact us below to join

---

## 📬 Contact
- Website: [clara.gg095.net](https://clara.gg095.net) *(coming soon)*  
- Email: [hello@gg095.net](mailto:hello@gg095.net)  
- Org: **GG095** (EU-based studio, focused on responsible AI tools)  

---

## 📖 License
MIT License — see [LICENSE](LICENSE).  
Open for academic pilots, feedback, and responsible reuse.