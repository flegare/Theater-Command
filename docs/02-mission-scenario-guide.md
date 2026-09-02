# 02 — Mission / Scenario Guide

How a single scenario `.ini` file is structured. Annotated from the real base-game file in
[`examples/example_mission_Officer_Training_1.ini`](examples/example_mission_Officer_Training_1.ini).

> A **mission** is one `.ini` file placed under a mod's `missions\` folder. Optionally paired with a
> `<mission>_briefing\` folder holding briefing text/map XML and images.

---

## Top-level structure

A mission file is a sequence of `[Section]` blocks. Order isn't strict, but the logical flow is:

```
[General]              → mission type
[Debug]                → dev/test toggles
[Language_xx] × N      → name, description, briefing paths (one block per language)
[Environment]          → date, time, weather, map location
[Mission]              → taskforce assignment + object counts
[TaskforceNVesselM]    → each unit's type, position, loadout, skill
[TriggerN]             → scripted events (conditions → actions)
[TaskforceN_Objectives]→ scored objectives
[BackgroundData]       → (optional) ambient/background world data
```

---

## `[General]`
```ini
[General]
Type=Tutorial      ; Tutorial | Mission (standard scenario) | etc.
```

## `[Debug]` (optional, strip before release)
```ini
[Debug]
DisableEnemyAIPlayer=True
```

## `[Language_xx]` — text & briefings
One block per supported language (`en`, `de`, `fr`, `es`, `ru`, `cn`, `ja`, `ko`, `vn`). Only `en` is required.
```ini
[Language_en]
Name=Officer Training 1 - Basic Ship Controls
Description=In this tutorial we will learn basic vessel controls...
Taskforce1StartmessageFreeContentPath=missions\Tutorials\Officer_Training_1_briefing\t01_window_1.xml
Taskforce1StartmessageFreeContentAssets=missions\Tutorials\Officer_Training_1_briefing
Objective_CompleteMission=Complete all tutorials     ; localized objective label
```
- `..._FreeContentPath` points to a briefing XML window shown to the player.
- `..._FreeContentAssets` points to the folder holding the briefing's images.
- `Objective_<Id>=` gives the human-readable text for an objective referenced in `[TaskforceN_Objectives]`.

## `[Environment]`
```ini
[Environment]
Date=1985,6,26           ; YYYY,M,D — drives which equipment/units are era-appropriate
Time=10,0                ; HH,MM
ConvertTimeToLocal=False
SeaState=2               ; 0 (calm) … higher = rougher, affects sonar & small craft
Clouds=Scattered         ; Clear | Scattered | Overcast ...
WindDirection=NW
MapCenterLatitude=67.49  ; real-world lat/long — sets the theatre
MapCenterLongitude=10.15
LoadBackgroundData=False
```

## `[Mission]`
Declares which taskforce the player controls and how many objects exist (counts must match the number of defined sections).
```ini
[Mission]
Difficulty=1
PlayerTaskforce=Taskforce1
EnemyTaskforce=Taskforce2
NumberOfTaskforce1Vessels=1
NumberOfTaskforce2Vessels=3
NumberOfTriggers=5
```
> `NumberOf...` values are load-time bookkeeping — keep them in sync with the actual `[TaskforceNVesselM]` / `[TriggerN]` sections you write, or units/triggers get dropped.

---

## Units — `[TaskforceNVesselM]`
Each unit is its own section. `N` = taskforce number, `M` = unit index within it.
```ini
[Taskforce1Vessel1]
Type=usn_ffg_oliver_hazard_perry   ; unit ID — must exist under vessels\ (or your mod)
VariantReference=Variant18          ; which fit/config from the vessel's variant list
StationRole=AAW                     ; doctrine role: AAW | ASW | ASuW | ...
CrewSkill=Trained                   ; Green | Trained | Veteran | Elite
RelativePositionInNM=-0.02,0,-1.87  ; X,Y,Z offset in nautical miles from map center
Telegraph=0                         ; engine order / starting speed setting
Heading=90                          ; degrees
```
Common extra keys:
- `Disabled=True` — unit exists but is inactive until a trigger enables it (see below).
- `LoadoutVariant=Default` — weapons loadout selection.
- `SquadronReference=SquadronN` — for aircraft/helicopter groups.
- Waypoints / patrol routes can be attached for AI movement.

> Find valid `Type=`, `VariantReference=`, and `StationRole=` values by browsing the corresponding
> definition files under `original\vessels\`, `original\aircraft\`, etc.

### Coordinate system — `RelativePositionInNM=X,Y,Z`

Position is an offset in **nautical miles from the mission's map centre** (`MapCenterLatitude` / `MapCenterLongitude` in `[Environment]`). Derived by cross-checking real base-game missions against real-world geography:

| Axis | Meaning |
|------|---------|
| **X** | **+East / −West** (nm) |
| **Z** | **+North / −South** (nm) |
| **Y** | vertical: `0` = surface ship · `low` = land/coast unit · a depth value for submerged subs |

**Convert real lat/long → offset** (so you don't eyeball positions):
```
NM_north = (lat − MapCenterLatitude) × 60
NM_east  = (lon − MapCenterLongitude) × 60
RelativePositionInNM = NM_east, 0, NM_north
```
(Both axes are simply arc-minutes of lat/lon. **Verified in-game 2026-07-23** by comparing a save file's `GeoPosition` against the mission's `RelativePositionInNM` for a stationary unit: the game applies **no** `cos(latitude)` compression to X, so the "X" axis is minutes of longitude, not true nautical miles east. A save file (`saves\missions\*.sav`) stores `GeoPosition=lat,lon,depth` per unit — saving in-game and reading it back is the easiest way to capture an exact position, e.g. a dock.)

`Heading` is degrees clockwise from north. `Waypoints=x,0,z` (same axes) gives a unit a move order; chain multiple with `|`.

> **The intended workflow is visual:** place units by dragging them on the map in the in-game **Mission Editor**, which writes these coordinates for you. Hand-authoring coordinates is for when you want geographic precision (compute them with the formula above) or scripted/bulk placement.

---

## Triggers — `[TriggerN]`
The scripting engine. Each trigger = a set of **conditions** that, when satisfied, fire **actions**.
See [`03-triggers-and-conditions.md`](03-triggers-and-conditions.md) and the official
`Mission Editor. Triggers and conditions.docx` for the full catalogue.

Examples straight from the tutorial:
```ini
[Trigger1]                                  ; show the opening briefing at t=1s
Name=Start message
Action_Taskforce1_FreeContent=Taskforce1StartmessageFreeContent
Condition_Condition1_Type=Time
Condition_Condition1_Time=1
ConditionsCompleted=<Condition1>

[Trigger2]                                  ; activate a dormant enemy on cue
Name=QST Guns
Disabled=True
Action_Units=Taskforce2Vessel2
Action_SetEnabledStatus=True

[Trigger4]                                  ; spawn/reveal a threat to the player
Name=QST Harpoon
Action_Units=Taskforce2Vessel3
Action_SetEnabledStatus=True
Action_UnitRevealToTaskforce=Taskforce1|Identify

[Trigger3]                                  ; win condition
Name=Exit
Disabled=True
Action_EndMission=True
Action_Victory=Taskforce1
Action_ObjectivesCompleted=CompleteMission
```
Pattern: `Condition_<id>_Type=...` defines a condition, `ConditionsCompleted=<Cond1 AND Cond2>` sets
the boolean logic, and `Action_...=` keys define what happens.

---

## Objectives — `[TaskforceN_Objectives]`
```ini
[Taskforce1_Objectives]
CompleteMission=5,-5,Complete,Main
;            = points_success, points_fail, initial_state, category(Main|Secondary)
```
The objective **ID** (`CompleteMission`) is displayed via the matching `Objective_CompleteMission=` label
in each `[Language_xx]` block, and is completed by `Action_ObjectivesCompleted=CompleteMission` in a trigger.

---

## Minimal mission skeleton to copy

```ini
[General]
Type=Mission

[Language_en]
Name=My First Scenario
Description=A short surface engagement in the Norwegian Sea.
Objective_SinkEnemy=Sink the enemy combatant

[Environment]
Date=1985,6,26
Time=12,0
SeaState=2
Clouds=Scattered
WindDirection=W
MapCenterLatitude=67.5
MapCenterLongitude=10.0

[Mission]
Difficulty=1
PlayerTaskforce=Taskforce1
EnemyTaskforce=Taskforce2
NumberOfTaskforce1Vessels=1
NumberOfTaskforce2Vessels=1
NumberOfTriggers=1

[Taskforce1Vessel1]
Type=usn_ffg_oliver_hazard_perry
VariantReference=Variant18
StationRole=AAW
CrewSkill=Trained
RelativePositionInNM=0,0,0
Heading=90
Telegraph=2

[Taskforce2Vessel1]
Type=usn_septar_qst-35
VariantReference=Variant1
CrewSkill=Trained
RelativePositionInNM=8,0,8
Heading=270
Telegraph=2

[Trigger1]
Name=Win when enemy sunk
Condition_Condition1_Type=UnitDestroyed
Condition_Condition1_Units=Taskforce2Vessel1
ConditionsCompleted=<Condition1>
Action_EndMission=True
Action_Victory=Taskforce1
Action_ObjectivesCompleted=SinkEnemy

[Taskforce1_Objectives]
SinkEnemy=10,-10,Incomplete,Main
```
> Verify exact condition/action key spellings against the official DOCX before relying on them — the
> catalogue is large and this skeleton shows the *shape*, not every valid keyword.
