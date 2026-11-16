# Meridian V1 Architecture & Epistemic Ledger

Meridian V1 puts one physical truth underneath every drill tool: every performer stands at an exact point `(xMeters, yMeters)` measured in meters from the center axis and front boundary. From that single source of truth, the app generates North American and international field coordinates, live stadium hash translations, sub-count collision checks, sound arrival times, 3D views, and auditable AI drill fixes.

---

## Steelmanning Traditional Drill Tools & Why Meridian Bridges Further

Modern marching arts already have strong tools like Pyware 3D, EnVision, and UDBapp. Those tools excel at keyframe charting, traditional step-grid plotting, and performer dot delivery. They break down at three everyday boundaries:

1. **Cross-venue hash drift:** A high school band practices all week on NFHS hashes (53 ft 4 in from the sideline) and then competes Saturday in an NCAA/DCI stadium (60 ft from the sideline) or an NFL stadium (70 ft 9 in). Legacy charts bake hash steps into static text rather than keeping physical meters canonical and projecting venue deltas live.
2. **Blind endpoint checks:** Checking performer safety only on Set counts misses head-on pass-through collisions that happen mid-set on count 4, and checking straight-line distance misses the extra stride demanded by curved arcs and high-momentum 180-degree turns.
3. **Opaque edits without receipts:** Reassigning marchers or smoothing collisions by hand leaves no before/after proof of what improved, what broke, or how to revert cleanly.

Meridian V1 implements **Projected Context feeding Harness Production**:
- A designer states an intent (either via the AI Intent Bar or a 1-click physics action).
- The harness fails closed if preconditions fail (out-of-range sets, zero counts, empty selection, or stadium boundary overflow).
- When valid, the harness runs exact mathematical solvers (`O(n^2 m)` Jonker-Volgenant/Hungarian bipartite matching, iterative quadratic Bezier pass-through deflection, or radial acoustic compaction) and logs a `HarnessRunReceipt` with an input digest, before/after metrics, and a full snapshot for instant lossless revert.

---

## Epistemic Provenance

### `stated` — Rulebook & Physical Constants
- **NCAA / DCI / BOA Field (`NCAA_DCI`):** 100 yards (91.44 m) playing length between goal lines, 10-yard (9.144 m) endzones, 160 ft (48.768 m) sideline-to-sideline depth, front hash at 60 ft (18.288 m), back hash at 100 ft (30.48 m), and 8-to-5 step size of 22.5 in (0.5715 m). Source: NCAA Football Field Spec / DCI & BOA Competition Standards.
- **NFHS High School Field (`NFHS_HS`):** 91.44 m length, 48.768 m depth, hashes dividing field depth into equal thirds at 53 ft 4 in (16.256 m) and 106 ft 8 in (32.512 m). Source: NFHS Football Field Rulebook.
- **NFL Pro Stadium (`NFL_PRO`):** 91.44 m length, 48.768 m depth, hashes at 70 ft 9 in (21.5646 m) and 89 ft 3 in (27.2034 m). Source: NFL Official Field Diagram.
- **DCUK / DCE International Metric (`DCUK_DCE`):** 91.44 m length, 48.8 m depth, hashes at 18.3 m and 30.5 m, and a 4.5 m front staging pit. Source: Drum Corps United Kingdom / Drum Corps Europe Rulebook.
- **JMBA Japan Arena Floor (`JMBA_30M`):** 30.0 m x 30.0 m competition square divided into 5.0 m point intersections with an 8-per-5m step size (0.625 m). Source: Japan Marching Band Association Arena Floor Specification.
- **Speed of Sound:** `331.3 * sqrt(1 + T_celsius / 273.15)` m/s (`343.21 m/s` at 20°C dry air).

### `concluded` — Physics Thresholds & Calibrated Failure Conditions
- **Sub-Count Collision Thresholds:** Sampled every `0.25` counts. `CRITICAL` fires below `0.55 * (rA + rB)` and `NEAR_MISS` fires below `0.85 * (rA + rB)`. *Most likely wrong if* performers perform tightly choreographed visual body-contact ripples where clearance intentionally drops below 0.8 m.
- **Stride Alerts:** `WARNING` below `6.0-to-5`, `CRITICAL` below `4.5-to-5`. *Most likely wrong if* an ensemble intentionally stages a high-velocity solo scatter or sprint feature for trained drum corps members.
- **Momentum Whiplash:** Fires when consecutive active transitions turn more than `110°` while peak speed exceeds `1.5 m/s`, weighted by instrument mass factor (`1.55` for Tubas, `1.45` for Tenors). *Most likely wrong if* a halt or prep-step pause is inserted between sets inside musical counts without splitting the set.
- **Acoustic Tear Risk:** Measured relative to Front Pit `(0, -2.0 m)` arriving at the Front Focal Listener `(0, -4.0 m)`. `MODERATE` above `65 ms` and `HIGH` above `85 ms`. *Most likely wrong if* a corps uses live backfield amplification or time-aligned PA speakers, or listens back-to-front instead of front-to-back.
- **Hungarian Stride Exponent (`2.2`):** Minimizing `distance^2.2` penalizes individual extreme step spikes more heavily than sum-of-distances (`p = 1`) while guaranteeing zero crossing paths.

### `gap` — Explicit V1 Scope Boundaries
- **Multi-User Cloud Sync:** V1 runs offline-first in the browser with `localStorage` persistence and portable `.meridian.json` / `.md` bundles rather than a hosted WebSocket collaboration server.
- **Show Music Audio Sync:** V1 includes a Web Audio API woodblock metronome synchronized to set BPM and counts; importing licensed MP3/WAV recordings with tempo-map beat grids is reserved for V2.
- **External LLM API Routing:** V1's AI Intent Bar parses bounded natural-language commands deterministically offline so edits execute reliably in milliseconds with zero API key dependency or silent hallucination risk.

---

## Calibrated Crux

The hardest tension in automated drill optimization is **musical voicing continuity versus raw stride minimization**: a global `O(n^2 m)` assignment can always eliminate crossings and shrink step sizes, yet blindly swapping Trumpet and Baritone slots breaks horn-line blend and visual color. Meridian V1 refuses to decide silently—it exposes `Lock Section Voicing` directly beside the AI Lens input and persists every run in the reversible AI Ledger so designers hold final authority.
