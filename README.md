# Meridian V1 — Marching Band & Drum Corps Drill Studio

Meridian V1 is an offline-first drill design, physics verification, and rehearsal collaboration studio built for premier high school bands and international drum corps.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a modern browser.

## Verification Gates

Run the complete automated check suite (doubt-token scan, strict TypeScript check, closed-form unit invariants, and Vite production bundle):

```bash
npm run verify
```

## Core Capabilities in V1

- **Canonical Meter Engine + 5 International Field Standards:** Switch seamlessly between `NCAA / DCI`, `NFHS High School`, `NFL Pro Stadium`, `DCUK / Europe Metric`, and `JMBA Japan 30m x 30m`, with live **Ghost Venue Hash Overlays** showing exact step shifts when traveling between practice and competition stadiums.
- **Sub-Count Physics & Acoustic Radar:** Scans transitions every `0.25` counts for head-on collisions, equipment pinches, extreme stride spikes, high-momentum direction-reversal whiplash, and temperature-dependent acoustic arrival lag (`ms`).
- **AI Intent Lens & Reversible Solver Harness:** Run natural-language commands (`Cmd/Ctrl + K`) or 1-click fixes (`Optimize Dot Assignment`, `Curve Pass-Through Collisions`, `Stage Brass Arc`, `Company Front`, `Compact Acoustic Delay <55ms`). Every run logs a materialized receipt with before/after deltas and lossless 1-click revert.
- **Multi-Camera 2D + 3D Studio Viewport:** Switch between `2D Tactical` (`1`), `3D Judge High-Cam` (`2`), `3D Tech Box` (`3`), and `Performer POV` (`4`) with drag-to-orbit camera controls.
- **Body Control, Posture Markers & Movement Coach:** Encode 8 core postures (kneels, lunges, plie, jazz run, contrapposto), 5 horn/equipment angles, independent upper-body facing, and count-based sequential ripples directly on 2D/3D field markers, taught outside the field view through a live-synced Front + Side Mannequin Coach Card, a clickable Timeline Phrase Strip, and Dot-Book breakdowns.
- **Rehearsal Collaboration & Dot-Books:** Switch between `Designer`, `Field Tech`, and `Performer` roles, drop count-anchored Field Pins on turf, export Markdown Rehearsal Triage Sheets, inspect individual Performer Dot-Books, and share portable `.meridian.json` bundles.

## Keyboard Shortcuts

- `Space`: Play / Pause show timeline
- `1`, `2`, `3`, `4`: Switch camera preset (`2D Tactical`, `3D Judge`, `3D Box`, `Performer POV`)
- `[` / `]`: Jump to previous / next drill set
- `Cmd/Ctrl + K`: Focus AI Intent Lens bar
- `Esc`: Close modal or clear dot selection

## Project Layout

- `src/core/`: Pure TypeScript coordinate math, international field specs, Bezier interpolation, collision/stride/whiplash/acoustic intelligence, Hungarian solver, parametric forms, AI harness, 3D pinhole camera, Web Audio metronome, and collaboration exporters.
- `src/ui/`: React + HiDPI `<canvas>` 2D/3D viewport, AI Intent Command Bar, Physics/Ledger/Collaborate/Form inspector drawer, timeline scrubber, and Dot-Book modal.
- `tests/`: Closed-form unit invariant tests (including factorial brute-force verification of Hungarian optimality).
- `scripts/verify-gates.mjs`: Automated build and invariant verification gate.
- `docs/architecture-and-epistemics.md`: Provenance notes (`stated`, `concluded`, `gap`) and system trade-offs.
