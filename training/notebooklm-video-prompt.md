# NotebookLM Studio Video Prompt - Factory Terminal Operator Training

Use this prompt in NotebookLM Studio after adding the source files listed below.

## Recommended Sources To Upload

Upload these files as sources:

1. `training/factory-terminal-training-source.md`
2. `TABLET_ROLLOUT.md`
3. `public/cover.html`
4. `public/index.html`
5. `public/station.html`
6. Optional visual reference: `public/cover-wallpaper.jpg`
7. Optional icon reference: `public/icons/factory-terminal-512.png`

Do not upload secrets, `.env` files, Sheet tokens, service-account JSON, cookies,
or screenshots that show private customer information.

## Prompt

Create a short practical training video for Anglo Windows factory operators
using the Factory Terminal tablet system.

Use only the uploaded sources. Treat `training/factory-terminal-training-source.md`
as the primary source of truth. Ignore older or conflicting information in any
other source.

Audience:

- Factory operators
- Supervisors training operators on the shop floor
- Operators may not be technical

Tone:

- Clear, calm, practical
- South African factory-floor context
- No marketing language
- No long technical explanations

Length:

- 4 to 6 minutes

Video structure:

1. What the Factory Terminal is for
2. How to start from the Android home-screen shortcut
3. What the charging cover page means
4. How to tap `START NORMAL OPERATION`
5. How to use in-app `Home` to return to station selection
6. How to confirm the operator
7. How to scan a QR code or type a Biz Ref/task number
8. How to check the job before saving
9. How to choose and confirm a normal status
10. When not to use `Confirm All`
11. What to do if the wrong job, wrong status, missing shortcut, or connection
    error appears
12. What operators must not touch: Android settings, weather/news/apps, Chrome
    settings, admin mode, and passwords

Important behavior to show clearly:

- The tablet launcher shortcut opens the station charging cover.
- The charging cover shows labels like `STATION-5 / SAW-2`.
- `START NORMAL OPERATION` opens the station dashboard without a password.
- The in-app `Home` button returns to station selection so a different operator
  can choose a different station.
- `ADMIN / NORMAL TABLET MODE` is for admin use only and is password-protected.
- Operators should never need the admin password.

Do not say:

- Do not claim the tablet changes the Google Sheet directly without the planner
  server. Say the Google Sheet remains the master and the tablet sends updates
  through the Factory Terminal system.
- Do not mention or reveal any admin password.
- Do not instruct operators to change Android developer settings, Wi-Fi sleep,
  wallpaper, Chrome settings, or shortcuts.
- Do not make REDO sound like a normal everyday status. Say it is for the
  supervisor-approved issue process only.

Suggested narration style:

Use short sentences. Demonstrate one action at a time. After showing each step,
state the rule in plain language.

Example wording:

"Start on the tablet home screen. Tap the station shortcut. The cover page tells
you which station this tablet is set up for. If this is the correct station, tap
Start Normal Operation."

"If another operator needs the tablet for a different station, use the Home
button inside the Factory Terminal. That takes you back to the station selection
page. Do not go into Android settings."

End with a quick checklist:

- Tap shortcut
- Check station cover
- Start normal operation
- Confirm operator
- Scan or type reference
- Check the job
- Select the correct status
- Confirm only when sure
- Call supervisor for problems

Output requested:

- Produce a video script with scene-by-scene narration.
- Include on-screen text suggestions.
- Include a short trainer checklist at the end.
- Keep all instructions aligned with the uploaded source material.

