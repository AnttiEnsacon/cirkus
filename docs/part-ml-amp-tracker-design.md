# Part-ML Owner-Declared AMP Tracker — Data Model & Due-Calculation Logic

Design sketch for a flight-club tool. Regulatory references are to Part-ML (Annex Vb of Reg. (EU) 1321/2014). Verify details against the current text and with your ARC reviewer / Traficom before relying on them.

---

## 1. Core design decisions

1. **Nothing stores "next due".** Next due is always *computed* from an anchor (last compliance, install date, AD effective date) + interval + current counters. Cache it in a view if you like, never hand-edit it.
2. **Counters belong to the thing being counted.** Aircraft have airframe hours and landings. Components carry their own TSN/TSO and inherit aircraft accrual only while installed. A magneto that moves between two club aircraft keeps its history.
3. **Every status is derived from signed records.** A task is "done" only because a released work order says so. A directive is "not applicable" only because a named person recorded that decision. No free-text overrides.
4. **Append-only.** Corrections are new rows that supersede old ones. Signed work orders are immutable. Everything hits an audit log.
5. **One pure function computes due status.** `compute_due(task, anchor, counters, utilisation, policy)` — no database access, fully unit-testable.

---

## 2. Entities

### 2.1 Aircraft & usage

**aircraft**
| field | notes |
|---|---|
| id, registration, type_designator, msn, year_built, mtow_kg | |
| hours_meter_type | `tach` / `hobbs` / `airborne` — pick one as *airframe hours* and never mix |
| cycles_source | `landings` (piston) / `starts` |
| amp_basis | `ICA` (manufacturer's programme) or `MIP` (Part-ML minimum inspection programme) |
| current_amp_version_id | FK → amp_version |
| status | `airworthy` / `grounded` / `in_maintenance` — always derived, shown with reasons |
| owner_id | registered owner (the club) — appears on the AMP declaration |

**usage_entry** (journey log feed)
| field | notes |
|---|---|
| id, aircraft_id, flight_date | |
| hours_delta, landings_delta | per flight or per day |
| meter_after | optional — allows reconciliation against physical meter |
| source, source_ref | `booking_system` / `manual` / `adjustment` |
| entered_by, entered_at | |
| supersedes_id | for corrections (adjustment entries, never edits) |

Current counters for an aircraft = SUM of non-superseded deltas. Materialise as `aircraft_counters(aircraft_id, as_of, total_hours, total_cycles)`.

**utilisation** (derived, not stored long-term)
- `hours_per_day` = hours flown in trailing 365 days ÷ 365 (fallback: owner's estimate in the AMP)
- `cycles_per_hour` = trailing-year landings ÷ hours
- Seasonal clubs: consider a trailing-90-day figure for short-horizon forecasting and 365-day for long horizon.

### 2.2 Components

**component**
| field | notes |
|---|---|
| id, part_number, serial_number, description, ata_chapter | |
| parent_component_id | engine → magneto, propeller → governor |
| is_life_limited | true if from the Airworthiness Limitations Section (e.g. CAPS rocket, line cutters, airbag inflators) |
| life_limit_hours / life_limit_months / life_limit_cycles | hard limit (scrap) |
| overhaul_interval_hours / _months / _cycles | TBO — under Part-ML TBO for a private piston can be extended per the AMP basis; model as a task, not as a limit |
| manufacture_date | anchor for calendar life on parts like CAPS (limit runs from manufacture or pack date — check the ALS) |
| traceability_doc_id | Form 1 / 8130-3 / OEM certificate |

**component_installation** (history, one row per fitting)
| field | notes |
|---|---|
| component_id, aircraft_id, position | e.g. `LH magneto` |
| installed_date, installed_at_aircraft_hours, installed_at_aircraft_cycles | |
| tsn_at_install, tso_at_install, csn_at_install | component counters at fitting |
| removed_date, removed_at_aircraft_hours, removed_reason | null while installed |
| work_order_id | the release that fitted it |

Component counters while installed:
```
tsn_now = tsn_at_install + (aircraft_hours_now − installed_at_aircraft_hours)
tso_now = tso_at_install + (aircraft_hours_now − installed_at_aircraft_hours)
```
After removal they freeze at the removal values.

### 2.3 Maintenance programme & tasks

**amp_version**
| field | notes |
|---|---|
| aircraft_id, version, basis (`ICA`/`MIP`), effective_date | |
| ica_reference | e.g. "Cirrus AMM 12137-001 rev X, Ch. 4 & 5; Continental M-0; Hartzell 202A" |
| declared_by, declared_date, declaration_doc_id | Appendix I declaration, signed by owner |
| reviewed_date, reviewed_by | annual review, normally at the ARC |
| change_summary | |

**task_definition** — one row per recurring or one-off requirement in the AMP
| field | notes |
|---|---|
| id, aircraft_id, amp_version_id, code, title | code e.g. `INSP-100H`, `CAPS-REPACK`, `AD-2024-0123-R` |
| source_kind | `ICA` / `MIP` / `ALS` / `AD` / `SB` / `OWNER` |
| source_ref | document + paragraph |
| target_kind, target_id | `aircraft` or `component` — decides which counters are used |
| interval_hours, interval_months, interval_cycles | null = not applicable; ≥2 set = *whichever first* |
| one_time | true for a one-off AD action or an initial inspection |
| anchor_kind | `last_compliance` / `install` / `manufacture` / `fixed` |
| anchor_date, anchor_hours, anchor_cycles | only when `anchor_kind = fixed` (e.g. AD effective date + "within 50 h or 3 months") |
| tolerance_hours, tolerance_months, tolerance_cycles | as permitted by the AMP basis; **forced to 0 when source_kind ∈ {ALS, AD}** unless the AD itself grants one |
| reset_rule | `from_actual` (next due from when it was actually done) / `from_original` (from when it was originally due — prevents interval creep when tolerance is used) |
| pilot_owner_allowed | true if in Part-ML Appendix II list (oil change, tyre, spark plugs…) |
| active, superseded_by_id | |

**task_compliance** — created only when a work order is released
| field | notes |
|---|---|
| task_id, work_order_id | |
| done_date, done_at_hours, done_at_cycles | copied from the release |
| notes | |

### 2.4 Work & release

**work_order**
| field | notes |
|---|---|
| id, aircraft_id, kind | `scheduled` / `unscheduled` / `pilot_owner` / `defect_rectification` |
| opened_date, closed_date | |
| performed_by_org, performed_by_person | Part-145/CAO/independent certifying staff or pilot-owner |
| aircraft_hours_at_release, aircraft_cycles_at_release | mandatory on release |
| crs_by_name, crs_licence_no, crs_licence_type, crs_date, crs_text | Certificate of Release to Service (ML.A.801) or pilot-owner CRS (ML.A.803) |
| release_hash | hash of the record + attachments at signing; makes the row immutable |
| status | `open` → `released` (no edits after) |

**work_order_item**
| field | notes |
|---|---|
| work_order_id, task_id (nullable), defect_id (nullable) | |
| description, reference_data | what was done, per which manual paragraph |
| removed_component_id, installed_component_id | drives `component_installation` |
| parts_used | with Form 1 / 8130-3 doc ids |

### 2.5 Defects

**defect**
| field | notes |
|---|---|
| id, aircraft_id, reported_date, reported_by, description | pilots can create these |
| affects_airworthiness | decided by certifying staff |
| status | `open` / `deferred` / `rectified` |
| deferred_by, deferred_date, deferral_basis | ML.A.403 — deferral by certifying staff or, within Appendix II scope, pilot-owner |
| deferral_limit_date, deferral_limit_hours | |
| rectified_work_order_id | |

### 2.6 Directives (ADs, SBs)

**directive**
| field | notes |
|---|---|
| id, kind (`AD`/`SB`/`SIL`), issuer (`EASA`/`FAA`/`Cirrus`/`Continental`/`Hartzell`/`Garmin`…), reference, revision | |
| title, issue_date, effective_date, source_url, doc_id | |
| supersedes_id | AD chains |
| applicability_text | type/serial/part-number ranges as written |

**directive_assessment** — per aircraft (and per component where the AD is part-based)
| field | notes |
|---|---|
| directive_id, aircraft_id, component_id (nullable) | |
| decision | `applicable_one_time` / `applicable_recurring` / `not_applicable` / `superseded` |
| rationale | e.g. "MSN 2345 outside affected range 1000–2000" |
| assessed_by, assessed_date | required even for not-applicable — the reviewer will ask |
| task_id | the task_definition created when applicable |
| review_due_date | re-check when a new revision appears |

### 2.7 Configuration & records

**modification**: aircraft_id, kind (`STC`/`CS-STAN`/`minor_change`/`major_repair`/`repair`), reference, description, approval_doc_id, embodied_date, work_order_id, affects_wb, afm_supplement_doc_id.

**weight_and_balance**: aircraft_id, date, method (`weighed`/`calculated`), empty_weight_kg, empty_cg, moment, equipment_list_doc_id, report_doc_id, supersedes_id.

**arc_review**: aircraft_id, review_date, physical_survey_date, reviewer_name, reviewer_authorisation, result, arc_reference, arc_expiry_date, findings, package_doc_id.

**document**: id, kind (`form1`/`8130`/`crs`/`logbook_scan`/`amp`/`declaration`/`arc`/`ad_text`/`sb_text`/`wb_report`/`afm_supp`/`other`), filename, sha256, uploaded_by, uploaded_at, linked_entity, linked_id.

**person / user**: id, name, roles ⊆ {`admin`, `technical_manager`, `certifying_staff`, `pilot_owner`, `arc_staff`, `pilot`}, licence_no, licence_categories, authorisation_expiry.

**audit_log**: entity, entity_id, action, before_json, after_json, user_id, timestamp, prev_hash, hash (hash-chained).

---

## 3. Due calculation

### 3.1 Inputs
```
task        : task_definition
anchor      : (date, hours, cycles)     — see §3.2
counters    : (today, hours_now, cycles_now) — aircraft or component depending on task.target_kind
util        : (hours_per_day, cycles_per_hour)
policy      : (warn_hours=10, warn_days=30, warn_cycles=25) — per aircraft, configurable
```

### 3.2 Resolving the anchor
```
if task.one_time and compliance exists:           status = COMPLETE, stop
match task.anchor_kind:
  last_compliance -> latest task_compliance (date, hours, cycles); if none: use the
                     initial "as found" values entered at setup (flagged as
                     'setup_baseline', with the supporting logbook scan attached)
  install         -> component_installation (installed_date, tsn_at_install, csn_at_install)
  manufacture     -> (component.manufacture_date, 0, 0)
  fixed           -> (task.anchor_date, task.anchor_hours, task.anchor_cycles)
if task.reset_rule == from_original and previous due is known and tolerance was used:
  anchor = previous original due (not the actual done point)
```

### 3.3 Compute
```python
def compute_due(task, anchor, counters, util, policy):
    limits = []   # each: (kind, due_value, remaining, remaining_days_est, tol)

    if task.interval_hours:
        due_h = anchor.hours + task.interval_hours
        rem_h = due_h - counters.hours_now
        est_days = rem_h / util.hours_per_day if util.hours_per_day > 0 else None
        limits.append(("hours", due_h, rem_h, est_days, task.tolerance_hours or 0))

    if task.interval_months:
        due_d = add_months_clamped(anchor.date, task.interval_months)   # Jan 31 + 1 → Feb 28/29
        rem_d = (due_d - counters.today).days
        limits.append(("calendar", due_d, rem_d, rem_d, task.tolerance_months_as_days(anchor.date)))

    if task.interval_cycles:
        due_c = anchor.cycles + task.interval_cycles
        rem_c = due_c - counters.cycles_now
        cyc_per_day = util.hours_per_day * util.cycles_per_hour
        est_days = rem_c / cyc_per_day if cyc_per_day > 0 else None
        limits.append(("cycles", due_c, rem_c, est_days, task.tolerance_cycles or 0))

    if not limits:
        return Due(status="UNDEFINED")            # data error, surface it

    # whichever first = the limit with the smallest estimated days remaining
    controlling = min(limits, key=lambda l: (l.est_days is None, l.est_days))

    # status
    overdue_hard = any(l.remaining < -l.tol for l in limits)     # beyond tolerance
    overdue_soft = any(l.remaining < 0 for l in limits)          # inside tolerance window
    due_soon = (
        any(l.kind == "hours"    and l.remaining <= policy.warn_hours  for l in limits) or
        any(l.kind == "calendar" and l.remaining <= policy.warn_days   for l in limits) or
        any(l.kind == "cycles"   and l.remaining <= policy.warn_cycles for l in limits)
    )
    status = ("OVERDUE" if overdue_hard else
              "IN_TOLERANCE" if overdue_soft else
              "DUE_SOON" if due_soon else "OK")

    projected_date = counters.today + days(controlling.est_days) if controlling.est_days is not None else None
    return Due(status, controlling, limits, projected_date)
```

Rules baked into the function:
- **Tolerance is never available for ALS items or ADs** (enforce at task creation *and* in the function — defence in depth). If the AMP basis (e.g. the manufacturer's Chapter 5) grants a tolerance, store it on the task; the MIP does not define one, so MIP-based tasks default to 0.
- `add_months_clamped` must clamp to end of month; a 12-month interval from 29 Feb lands on 28 Feb.
- When `util.hours_per_day` is 0 (aircraft parked), hours/cycles limits have no projected date — show "at X h" only; the calendar limit controls.

### 3.4 Aircraft airworthiness status (derived, with reasons)
```
grounded if any of:
  - any task with status OVERDUE
  - any directive_assessment applicable with no compliance and past its compliance time
  - arc_expiry_date < today
  - any component life limit exceeded (life_limit_* vs tsn/csn/age)
  - any defect: affects_airworthiness and status = open,
                or status = deferred and deferral limit passed
  - no valid weight_and_balance on file
warn if any of:
  - task DUE_SOON or IN_TOLERANCE
  - amp_version.reviewed_date older than 12 months
  - arc_expiry within 60 days
  - directive with review_due_date passed
```
The booking system can read this, but display it as *information for the PIC*, not as a hard lock the club relies on.

### 3.5 What happens on release
1. Work order status → `released`; `aircraft_hours_at_release` and `_cycles` are mandatory.
2. For each item with `task_id`: insert `task_compliance` (date, hours, cycles from the release).
3. For each item with removed/installed component: close the old `component_installation`, open the new one with the release counters.
4. For each item with `defect_id`: defect → `rectified`.
5. Compute `release_hash` over the work order + items + attached document hashes; store; row becomes read-only.
6. Recompute derived views.

---

## 4. Setup baseline (day 1 data load)

When you first load an aircraft you don't have work orders for historic compliance. Use a **baseline** mechanism:
- A special work order of kind `setup_baseline`, dated the day of the records audit, with one item per task/component giving "last done at (date, hours, cycles)" and the logbook page scan as evidence.
- It's released by the technical manager, not by certifying staff, and flagged so the ARC reviewer can see which entries are baseline vs. real releases.
- Component TSN/TSO on the baseline must be reconciled to the logbooks; record the reconciliation note.

---

## 5. Reports the ARC reviewer will want (each is one query)
- AMP declaration + current version and last review date
- Task status list, sorted by projected date, with anchor evidence
- AD status: every directive assessed, with decision, rationale, date, and compliance evidence
- SB status (same shape)
- Life-limited components: TSN/age vs limit
- Component list with Form 1 references
- Modifications and repairs with approval basis
- Current W&B and equipment list
- Open and deferred defects
- Hours and landings reconciliation (journey log vs airframe logbook)
- Previous ARC and findings

Generate as a PDF bundle with the audit-log hash on the cover page.

---

## 6. Test cases to write before anything else
1. 100 h / 12 months, done at 1234.5 h on 2026-03-15; now 1301.2 h on 2026-09-20, 0.4 h/day → hours controls (~83 days), status OK; at 1291 h → DUE_SOON.
2. CAPS repack, 120 months from pack date, no hours limit, no tolerance → calendar only, projected date exact.
3. AD one-off "within 50 h or 3 months after effective date" with `anchor_kind = fixed` → becomes COMPLETE after one compliance.
4. Recurring AD every 100 h with 0 tolerance → OVERDUE at 100.1 h past.
5. ICA task with 10 h tolerance, done 5 h late, `reset_rule = from_original` → next due does not drift.
6. Magneto moved from OH-ABC to OH-XYZ → TSN continues, aircraft accrual switches.
7. Parked aircraft (0 h/day) → hours limit shows "at X h", calendar limit controls.
8. Usage correction entry supersedes a wrong entry → counters and all due values update, old entry still visible in history.
9. 12-month interval anchored 2028-02-29 → due 2029-02-28.
10. Attempt to edit a released work order → rejected; attempt to set tolerance on an ALS task → rejected.

---

## 7. Things deliberately left out (add later)
- MEL/CDL (not applicable to Part-ML private ops)
- Multi-tenant clubs, billing, parts inventory
- Automatic AD ingestion — plan for e-mail/RSS subscriptions from EASA and FAA feeding a "to assess" inbox with `directive` rows created by hand
