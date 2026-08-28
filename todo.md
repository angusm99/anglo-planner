# Anglo Planner TODO

## Factory Manager Control Terminal v1
- [x] Read and audit all required architecture, rollout, data-contract, server, cascade, and existing UI files before coding
- [x] Preserve the existing operator tablet workflow and `/api/update` write path unchanged
- [x] Do not modify Google Apps Script, write to Google Sheets, restart the live server, or publish/deploy
- [x] Add a separate read-only `/manager` Operations Command Centre route
- [x] Use individual jobs and displayed Bizman references only; do not invent a job-group key
- [x] Calculate update freshness from `events.created_at`, never `jobs.updated_at`
- [x] Resolve station vocabulary and names from the canonical station definitions
- [x] Implement active, at-risk, blocked/attention, freshness, station-load, last-activity, priority-job, recent-update, and install-horizon summaries
- [x] Treat Station 8 Bead Saw as a `job_status` workflow rather than an `s8` column
- [x] Add a visually separate, non-writing Manager Queue / Instructions placeholder and future data contract
- [x] Apply a professional, modern, minimal Anglo Windows graphite, warm-white, and restrained-yellow design
- [x] Optimise for approximately 1280×800 landscape while preserving portrait usability
- [x] Add tests for all new summary/classification logic and keep the existing test suite passing
- [x] Verify the manager page locally without changing any live integration
- [x] Document changed files and features intentionally left unwired
