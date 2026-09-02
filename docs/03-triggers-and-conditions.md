# 03 — Triggers & Conditions (Quick Reference)

> ⚠️ **The authoritative, exhaustive reference is the official file:**
> [`official/Mission Editor. Triggers and conditions.docx`](official/) (1 MB, shipped with the game).
> Read it before doing complex scripting. This page is a fast-lookup summary compiled from that doc,
> the in-game editor, base-game mission files, and the community references linked at the bottom.

---

## Mental model

A **trigger** is a rule: *when these **conditions** are met, run these **actions**.*

```ini
[TriggerN]
Name=Human-readable label
Disabled=True                              ; optional — starts inactive, enabled by another trigger

; --- one or more CONDITIONS ---
Condition_Condition1_Type=<ConditionType>
Condition_Condition1_<param>=<value>
Condition_Condition2_Type=<ConditionType>
...

; --- boolean logic over the conditions ---
ConditionsCompleted=<Condition1 AND Condition2>

; --- one or more ACTIONS (fire when logic is satisfied) ---
Action_<something>=<value>
```

- Conditions are named `Condition1`, `Condition2`, … and referenced by that name in `ConditionsCompleted`.
- `ConditionsCompleted` supports boolean logic — e.g. `<Condition1>`, `<Condition1 AND Condition2>`,
  `<Condition1 OR Condition2>`, negation, and grouping. (Confirm exact operator spelling in the DOCX.)
- A trigger with no explicit condition and `Disabled=True` waits until another trigger enables it.

---

## Condition types (from the editor's Condition Type dropdown)

| Type | Fires when… | Key parameters |
|------|-------------|----------------|
| `Generic` | catch-all / manually controlled | — |
| `Time` | mission clock reaches a value | `Condition_CondN_Time=<seconds>` |
| `UnitDestroyed` | specified unit(s) destroyed | `Condition_CondN_Units=Taskforce2Vessel1` |
| `UnitEntersArea` | a unit enters a defined zone | area center + `Area Radius, nm`, side filter |
| `NoUnitsOfTypeLeft` | a whole category is eliminated | `Unit Type`, `Condition Side` |
| `UnitDetected` | a unit is detected (sensor contact) | target unit + detecting side |
| `UnitClassified` | a contact is identified/classified | target unit + side |
| `TriggerCompleted` | another trigger has fired | linked trigger name |
| `TriggerFailed` | another trigger has failed | linked trigger name |

**Common condition modifiers**
- `Condition Side` — Blue / Red / Neutral filter.
- `Unit Type` — Vessels / Submarines / Aircraft / Helicopters / Land Units / Biologic.
- `Minimum Units` — threshold count (0+).
- `Area Radius, nm` — zone radius for area-based conditions.
- `Description` — editor-only note.

---

## Actions (seen in base-game missions + common set)

| Action key | Effect |
|------------|--------|
| `Action_Units=<UnitSection>` | Target unit(s) the action applies to |
| `Action_SetEnabledStatus=True\|False` | Activate/deactivate a `Disabled=True` unit (spawn-on-cue) |
| `Action_UnitRevealToTaskforce=Taskforce1\|Identify` | Reveal/identify a unit to a side |
| `Action_TaskforceN_FreeContent=<MessageId>` | Show a briefing/message window |
| `Action_EndMission=True` | End the scenario |
| `Action_Victory=Taskforce1` | Assign victory to a side |
| `Action_ObjectivesCompleted=<ObjectiveId>` | Mark an objective complete (scores it) |
| `Action_EnableTriggers=<TriggerName>` | Enable another trigger |
| `Action_ReActivateTriggers=<TriggerName>` | Re-arm a trigger so it can fire again |

> Not exhaustive — the DOCX lists more (waypoint/movement orders, weapon-release control, variable
> setting for campaigns, taskforce swap, etc.). Cross-check exact key names there.

---

## Chaining triggers (state machines)

Triggers can drive each other, letting you build sequences and branches:

```ini
; Trigger A does something, then arms Trigger B
[Trigger10]
Name=Enemy sighted
Condition_Condition1_Type=UnitDetected
Condition_Condition1_Units=Taskforce2Vessel1
ConditionsCompleted=<Condition1>
Action_EnableTriggers=Trigger11

; Trigger B only fires if Trigger A already completed
[Trigger11]
Name=Reinforcements
Disabled=True
Condition_Condition1_Type=TriggerCompleted
Condition_Condition1_Trigger=Trigger10
Condition_Condition2_Type=Time
Condition_Condition2_Time=300
ConditionsCompleted=<Condition1 AND Condition2>
Action_Units=Taskforce2Vessel5
Action_SetEnabledStatus=True
```

**Branching:** use `TriggerFailed` vs `TriggerCompleted` conditions to fork behaviour depending on
whether an earlier objective succeeded or failed.

---

## Worked example (real, from the tutorial)

See [`examples/example_mission_Officer_Training_1.ini`](examples/example_mission_Officer_Training_1.ini):
- `Trigger1` fires at `Time=1` to show the opening briefing.
- `Trigger2`/`Trigger4`/`Trigger5` start disabled and activate enemy septar targets on cue via
  `Action_SetEnabledStatus=True` + `Action_UnitRevealToTaskforce`.
- `Trigger3` ends the mission with `Action_EndMission` + `Action_Victory` + `Action_ObjectivesCompleted`.

---

## Sources
- **Official:** `official/Mission Editor. Triggers and conditions.docx` (definitive).
- [PMC Tactical — Mission Editor: Triggers](https://sea-power.pmctactical.org/mission-editor-triggers.php)
- [PMC Tactical — Mission Editor beginner tutorial](https://sea-power.pmctactical.org/mission-editor-beginner-tutorial.php)
- [Steam Discussion — Triggers triggering other triggers](https://steamcommunity.com/app/1286220/discussions/0/4631484492942449679/)
