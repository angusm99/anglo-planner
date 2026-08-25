# Claude/Gemini Design Brief - Factory Terminal Training Material

Use this when asking Claude Design, Gemini, Canva, or another design tool to
turn the operator training into a handout, slide deck, poster, or video board.

## Source Of Truth

Primary source:

- `training/factory-terminal-training-source.md`

Supporting sources:

- `TABLET_ROLLOUT.md`
- `public/cover.html`
- `public/index.html`
- `public/station.html`
- `public/cover-wallpaper.jpg`
- `public/icons/factory-terminal-512.png`

Ignore older tablet rollout notes that conflict with the current behavior.

## Design Goal

Create practical shop-floor training material for Anglo Windows factory
operators using the Factory Terminal tablets.

The material must explain:

- Shortcut opens the charging cover.
- Cover identifies the station.
- `START NORMAL OPERATION` starts the dashboard.
- In-app `Home` returns to station selection.
- Operators confirm their name, scan/type a job reference, choose a status, and
  confirm.
- Admin mode is not for operators.

## Recommended Outputs

Create any of these:

- One-page laminated quick guide
- Four-page operator handout
- Supervisor training checklist
- 4 to 6 minute video storyboard
- A3 wall poster near charging area

## Visual Style

- Use Anglo black and yellow.
- Use large readable headings.
- Use screenshots or recreated tablet panels if available.
- Keep wording short.
- Avoid decorative clutter.
- Make the first action obvious: tap the station shortcut.

## Must Include

- "Shortcut = station cover"
- "Start Normal Operation = dashboard"
- "Home inside the app = station selection"
- "Check job before confirming"
- "Admin mode is for supervisors/admin only"

## Must Not Include

- Admin password
- Sheet token or server secrets
- Instructions for Android settings or developer settings
- Advice to clear shortcuts or change wallpaper
- Customer/private job screenshots unless approved

## Copy Tone

Plain, direct, factory-floor language.

Example:

"Check the job before you confirm. If the job or status is wrong, stop and call
the supervisor."

