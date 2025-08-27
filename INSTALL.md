INSTALL.md — C.L.A.R.A. (Chrome)

C.L.A.R.A. by GG095 is a local-only Chrome extension that tracks time on AI sites you choose (no prompts/keystrokes/page contents). This guide shows how to load the extension for testing.

⸻

1) Download the project

Option A — ZIP (easiest)
	1.	Open the GitHub repo.
	2.	Click Code → Download ZIP.
	3.	Unzip it. You will get a folder named clara-portfolio.

Option B — Git (optional)

git clone https://github.com/<your-org-or-user>/clara-portfolio.git


⸻

2) Load the extension in Chrome
	1.	Open Chrome and go to: chrome://extensions/
	2.	Turn on Developer mode (top-right toggle).
	3.	Click Load unpacked.
	4.	In the picker, open the folder:
	•	clara-portfolio/extension/  ← select THIS folder
(This folder must contain manifest.json.)
	5.	Click Open. You should now see C.L.A.R.A. in the list.

✅ If you accidentally select the top folder clara-portfolio/ you’ll get
“Manifest file is missing or unreadable.”
Reload and pick clara-portfolio/extension/ instead.

⸻

3) Pin the extension (so you can click it)
	1.	Click the puzzle piece icon in Chrome’s toolbar.
	2.	Find C.L.A.R.A. and click the pin icon.

⸻

4) Quick setup inside C.L.A.R.A.
	1.	Open a tab for an AI site (e.g., chat.openai.com, gemini.google.com, claude.ai, perplexity.ai, etc.).
	2.	Click the C.L.A.R.A. icon → the popup opens.
	3.	Go to Rules and add the domains you want to track (e.g., chatgpt.com, gemini.google.com, claude.ai).
	4.	Return to the AI tab and keep it active—C.L.A.R.A. will start counting active minutes.

Tip: C.L.A.R.A. only counts the active tab. Background tabs are paused by design.

⸻

5) What to test (5 minutes)
	•	Dashboard: “Today / Week / Total” numbers increase while you’re on an AI site.
	•	Report tab: shows Weekly AI Report Card; try Export Report (PNG).
	•	Exports: click
	•	Export Portfolio JSON
	•	Export Weekly Portfolio JSON
	•	Export Attachment JSON
	•	Export Analytics JSON
You should get downloaded .json files.
	•	Theme: bottom right → Theme selector (System / Light / Dark).
	•	About & Policy: Settings → About & Policy button opens the modal.

⸻

6) Updating to a new version (manual)

When you receive a new ZIP or pull new git changes:
	1.	Replace the files inside your local clara-portfolio/extension/.
	2.	Go to chrome://extensions/ → find C.L.A.R.A. → click Reload (circular arrow).
(Or Remove → Load unpacked again if you changed the folder.)

⸻

7) Uninstalling
	•	chrome://extensions/ → C.L.A.R.A. → Remove.

This only removes the extension. Your local data is kept unless you cleared it from Settings.

⸻

8) Privacy notes (for schools)
	•	Tracks time on domains listed in Rules.
	•	Never collects prompts, keystrokes, page contents, or screenshots.
	•	Data stays 100% local; exports occur only when the student clicks.
	•	Exports:
	•	Attachment JSON (privacy-minimal; safe for LMS/email)
	•	Portfolio JSON (student report)
	•	Weekly Portfolio JSON (adds short history & integrity)
	•	Analytics JSON (research dataset; still no page contents)

See /schemas/ for exact field definitions.

⸻

9) Troubleshooting

A) “Manifest file is missing or unreadable.”
You loaded the wrong folder. Use clara-portfolio/extension/ (the one that contains manifest.json).

B) Buttons look black in dark mode on first open
Close the popup and click again, or switch Theme to Dark in the bottom bar once.
If it persists, right-click the popup → Inspect → check for CSS errors in Console.

C) No time is tracked
	•	Make sure the current tab’s domain is in Rules (exact domain like claude.ai or chatgpt.com).
	•	Only the active AI tab counts time; background tabs are paused.
	•	Click Resume in the footer if you previously paused tracking.

D) Export JSON fails / no download
	•	Check Chrome’s download permission (top-right download icon).
	•	Look in Console (right-click popup → Inspect) for errors.

E) PNG export looks empty
	•	Resize the popup or open the Report tab once before exporting (ensures the chart canvas is drawn at full size).

F) Service worker inactive
	•	chrome://extensions/ → C.L.A.R.A. → click Service worker under “Inspect views” to wake it.
	•	Click Reload on the extension.

⸻

10) Optional (Edge/Brave)

These steps also work in Edge (edge://extensions/) and Brave (brave://extensions/) with Developer mode + Load Unpacked.

⸻

11) Folder map (for reference)

clara-portfolio/
├─ extension/              # load THIS folder in Chrome
│  ├─ manifest.json
│  ├─ background.js
│  ├─ heartbeat.js
│  ├─ popup.html / popup.js / styles.css / theme.js
│  ├─ dashboard.html
│  ├─ icons/
│  ├─ assets/              # images/fonts; may include schema copy for in-app help
│  └─ pages/
│     ├─ student.html / student.js
│     └─ teacher.html / teacher.js
├─ schemas/                # JSON Schemas (specs)
│  ├─ schema-portfolio-v0_1.json
│  └─ schema-attachment-v0_1.json
├─ examples/               # sample exports for reviewers
│  └─ attachment_YYYY-MM-DD.json
├─ README.md
└─ LICENSE


⸻

12) Support
	•	Questions / pilot access: figa@manofiga.com
	•	Org: GG095 (EU-based studio for responsible AI tools)
