# Anglo Windows Factory Terminal - Training Source

Version: working tablet rollout committed as `586da61`  

Audience: factory operators, supervisors, and floor trainers  

System: Anglo Windows Material Planner tablets  

Server: `http://192.168.0.84:3300/`

## Purpose

The Factory Terminal lets factory operators update live production progress from
the shop-floor tablets. The Google Sheet remains the master record. The tablets
are a simple, controlled way to search for a job and record what happened at the
current station.

The tablets are for the dashboard workflow only. Operators should not use them
for weather, browsing, personal apps, Android settings, or other tablet tasks.

## Current Tablet Flow

1. Tap the station shortcut on the Android home screen.
2. The station charging cover opens, for example `STATION-5` and `SAW-2`.
3. Tap `START NORMAL OPERATION`.
4. The normal station dashboard opens.
5. Confirm the operator.
6. Scan the job cover-sheet QR code, or type the Biz Ref/task number.
7. Select the correct job status.
8. Read the confirmation message.
9. Tap the final confirm button to save.

Important navigation rule:

- The Android home-screen shortcut opens the charging cover page.
- The in-app `Home` button opens the old station-selection page.
- Use the in-app `Home` button if the tablet must be used for a different
  station.

## Tablet Shortcuts

The current tablets are:

| Shortcut | Cover page | Normal station |
|---|---|---|
| `Station 4` | `STATION-4 / SAW-1` | Saw 1 |
| `Station 5` | `STATION-5 / SAW-2` | Saw 2 |
| `Station 6` | `STATION-6 / ASSEMBLY` | Assembly |
| `Station 8` | `STATION-8 / BEAD SAW` | Bead Saw |

Station 5 and Station 6 shortcuts may be on the next Android launcher page.
Swipe left from the normal Android home page if the shortcut is not immediately
visible.

## Starting A Shift

1. Make sure the tablet is plugged in or charged.
2. Tap the station shortcut.
3. If the Chrome address bar is visible, tap anywhere on the cover once to enter
   fullscreen.
4. Check the cover label matches the station where the tablet is being used.
5. Tap `START NORMAL OPERATION`.
6. If the tablet is being used at another station, tap the in-app `Home` button
   and choose the correct station from the station-selection page.

## Choosing Operator

The station screen asks who is using the station.

- Tap `PRIMARY OPERATOR` when the listed person is using the tablet.
- Tap `GUEST OPERATOR` when someone else is using the tablet.
- Type the guest operator name clearly.
- The operator name is important because it is recorded with updates.

## Finding A Job

Use one of these methods:

- Scan the job cover-sheet QR code.
- Type the Biz Ref or task number manually.
- Enter several references separated by spaces, commas, semicolons, or new
  lines when batching work.

Before saving anything, check that the job shown on screen is the correct job.
Use the Biz Ref, customer, colour, and job details to confirm.

## Saving A Normal Status

1. Open the job.
2. Choose the correct status button for the work done.
3. Read the confirmation text.
4. Tap the confirm button.
5. Wait for the success message.

Do not tap a status just to look around. A status update is a production record.

## Batch Confirm

When several references are entered, the tablet can stage the normal completion
status for the station.

Use `Confirm All` only when every listed job is genuinely at the same correct
completed state for that station. If one job is different, handle it separately.

## Station Status Guide

Common safe rule:

- Use the normal completion status when the job is complete at your station.
- Use short/defect statuses only when there is a real issue.
- Use `REDO` only when the supervisor-approved REDO process is being followed.

Station 4 - Saw 1:

- Normal completion: `DONE`
- Other common statuses: `JOB PICKED`, `PICK SHORT`, `DEFECT`, `W.I.P`,
  `CUT-SHORT`, `PICK TROLLEY`

Station 5 - Saw 2:

- Normal completion: `DONE`
- Other common statuses: `SCHEDULED`, `JOB PICKED`, `W.I.P`, `DEFECT-M`,
  `PICK SHORT`, `PICK TROLLEY`

Station 6 - Assembly:

- Normal completion: `ALL DONE`
- Frame completion options: `WINDOWS DONE`, `S-FRONT DONE`, `SLIDERS DONE`
- Other common statuses: `SCHEDULED`, `JOB PICKED`, `W.I.P`

Station 8 - Bead Saw:

- Normal completion: `DONE`
- Issue statuses: `BEAD SHORT`, `NOT PICKED`

## REDO Rule

`REDO` is not a casual status button. It starts an issue-report workflow and
notifies Material Despatch with a numbered replacement pick.

Only use `REDO` when the supervisor or current floor process says to log a REDO.
Fill in the unit and issue details carefully. Do not use REDO to mean "I am not
sure" or "come back later".

## Switching To Another Station

When a different operator needs the tablet for another station:

1. From inside the app, tap `Home`.
2. The station-selection page opens.
3. Choose the required station.
4. Confirm the operator.
5. Continue with scan/type reference and status update.

Do not use Android settings or Chrome tabs for station switching.

## Admin / Normal Tablet Mode

The `ADMIN / NORMAL TABLET MODE` button on the charging cover is for admin use.
It is password-protected. Operators do not need it for normal work.

Operators should use:

- `START NORMAL OPERATION` to begin work.
- In-app `Home` to choose a different station.

## What Not To Do

- Do not open weather, news, browser, email, Play Store, games, or Android
  settings.
- Do not change Wi-Fi, display, developer, wallpaper, or Chrome settings.
- Do not unpin, close, or clear Chrome unless asked by admin.
- Do not share or ask for the admin password.
- Do not save a status unless the job and status are correct.
- Do not use `Confirm All` unless every listed job is correct.

## Troubleshooting For Operators

`This site can't be reached`:

- Tell the supervisor. The planner PC or Wi-Fi may be offline.

The tablet shows the wrong station:

- Tap in-app `Home` and choose the correct station.

The tablet shows Chrome address bar:

- Tap the cover page once to request fullscreen.

The shortcut is not visible:

- Swipe left on the Android home screen and look for `Station 5` or
  `Station 6`.
- Tell the supervisor if the shortcut is still missing.

The wrong job opened:

- Do not save a status.
- Go back and scan/type the correct reference.

The status was saved incorrectly:

- Tell the supervisor immediately. Do not try to hide it with another random
  status.

## Trainer Demonstration Script

1. Show the Android home-screen shortcut.
2. Tap the shortcut and identify the charging cover.
3. Tap the cover once for fullscreen if Chrome bars are visible.
4. Tap `START NORMAL OPERATION`.
5. Explain that in-app `Home` returns to station selection.
6. Choose a station.
7. Confirm primary operator.
8. Type a sample reference.
9. Show the job detail screen.
10. Select a normal status.
11. Pause at the confirmation screen and explain: "This is the last chance to
    check."
12. Confirm the update only in a safe test/demo job.
13. Show how to switch station using in-app `Home`.
14. Explain that admin mode is not part of operator workflow.

## Five-Minute Operator Checklist

- I know which shortcut to tap.
- I know the cover page identifies the station.
- I know `START NORMAL OPERATION` does not need a password.
- I know in-app `Home` takes me to station selection.
- I know how to confirm operator.
- I know how to scan or type a reference.
- I know to check the job before saving.
- I know to use `Confirm All` only when all jobs are correct.
- I know not to use admin mode or Android settings.
- I know to call a supervisor for wrong status, missing shortcut, or connection
  errors.
