# 04 — Dynamic Campaign Guide (Task Force Mode)

*Source: [Steam Guide — Task Force Mode Campaign Creation](https://steamcommunity.com/sharedfiles/filedetails/?id=3756769210) (user-recommended), plus base-game campaign files.*

> **Task Force Mode** is Sea Power's dynamic-campaign system. The player builds a persistent task force
> from a points budget; ships, aircraft, damage, ammo, and crew experience **carry across missions**.
> The generator drops the player's saved force into authored scenarios. It replaces static setups with
> a persistent, roster-driven experience.

---

## Folder layout

```
StreamingAssets\user\<Your Mod Name>\
├─ _info.ini
├─ campaigns\
│  └─ <your-campaign>\
│     ├─ campaign.ini                        ← master config (this is the heart of it)
│     ├─ commander_settings.ini              ← nations, ranks, ribbons, medals
│     ├─ player_task_force_roster.ini        ← what the player can buy
│     ├─ unit_roster_descriptions_en.ini     ← roster flavour text
│     └─ missions\
│        ├─ 01 First Mission.ini
│        └─ 02 Second Mission.ini
└─ art\
   ├─ ribbons\
   └─ medals\
```

> **Reference implementation:** study the base game's Task Force campaign under
> `original\campaigns\` (e.g. `pacific-strike-task-force\`) before authoring your own.

---

## `campaign.ini`

### 1. Enable Task Force Mode
```ini
[TaskForceMode]
Enabled=True
StartingPoints=50
PointCap=80
DefaultTaskForceName=Task Force 77
CommanderSettingsFile=commander_settings.ini
RosterFile=player_task_force_roster.ini
ShipIncludesAirwing=True     ; carriers bring their airwing at no extra points
```

### 2. Difficulty presets — `[TaskForceModeDifficulty_<Id>]`
```ini
[TaskForceModeDifficulty_Easy]
StartingPoints=65
PurchaseLoadouts=False          ; upgraded loadouts are free
RepairCostModifier=0.75         ; repairs 25% cheaper
CrewSkillInitial=Trained
InitialUnlockedLoadouts=Default,Early

[TaskForceModeDifficulty_Hard]
StartingPoints=40
PurchaseLoadouts=True           ; upgraded loadouts cost points
RepairCostModifier=1.25
CrewSkillInitial=Green
InitialUnlockedLoadouts=Default
```

### 3. Repair & rearm economy
```ini
DamageToAllowRepair=Light,Moderate
DamageToDisallowRepair=Heavy            ; heavy damage can't be repaired
RepairPointsCost=Light,0.1|Moderate,0.25   ; % of the unit's purchase price
```

### 4. Per-mission blocks — `[MissionN]`
Each mission the campaign runs gets a block controlling economy, threats, and generation:
```ini
[Mission1]
MissionFile=missions\01 First Mission.ini
TaskForceModeMissionGenerationType=Generated   ; Generated | Replaced | Blank

; economy
TaskForceModeCompletionPoints=15               ; points awarded on success
TaskForceModeCompletionCapPoints=5             ; raises the point cap
TaskForceModeEnableTaskForceBuilder=True       ; can the player re-spec before launch?
TaskForceModeRearm=True
TaskForceModeRepair=True
TaskForceModeMaxUnits=6                         ; cap deployed force size
TaskForceModeAllowedRosterUnits=usn_ddg_kidd,usn_p-3c   ; subset of the roster

; display-only threat & capability hints (level 1–5)
TaskForceModeIncludesTaskForce=True
TaskForceModeIncludesAirwing=True
TaskForceModeIncludesSubmarine=False
TaskForceModeThreatProfileShip=True,3
TaskForceModeThreatProfileAir=True,2
TaskForceModeThreatProfileSub=True,1
TaskForceModeThreatProfileLand=False

; reward free units on completion (independent of JoinTaskForce)
TaskForceModeCompletionRewardedUnits=usn_p-3c,Squadron31,1|usn_a-7e,Squadron10,2

; award ribbons (optionally nation-restricted)
TaskForceModeRibbonAwards=combat_action_ribbon|navy_unit_commendation
```

**Conditional rearm/repair** (tie to campaign variables set by mission triggers):
```ini
TaskForceModeRearmByVariableAND=AmmoCarrierSurvived,IsTrue
TaskForceModeRearmByVariableOR=AmmoShipSurvived,IsTrue|DepotCaptured,IsTrue
; condition forms: VariableName,IsTrue | ,NumberGreaterThan,5 | ,StringEqual,SomeValue
```

---

## Mission generation types

The `TaskForceModeMissionGenerationType` field controls how the player's force enters the mission:

| Type | Behaviour | Use when |
|------|-----------|----------|
| **Generated** | Places the force around **one anchor vessel** in the mission file; generator arranges the rest by saved formation data. Simplest. | New campaigns / most missions |
| **Replaced** | Numbered `TaskForceModeReplacedUnitIndex` slots are filled with player ships, preserving exact positions and trigger links. | Scenario scripting depends on specific positions/section names |
| **Blank / Empty** | Mission runs with no persistent-force integration. | Side missions, set-pieces |

### Generated — anchor vessel (in the mission `.ini`)
```ini
[Taskforce1Vessel1]
Type=usn_ddg_kidd
VariantReference=Variant3
LoadoutVariant=Default
RelativePositionInNM=0,0,0
Heading=090
Telegraph=3
TaskForceModeAnchor=True          ; exactly ONE anchor per mission
```
Placeholder (visible while editing, removed at launch):
```ini
[Taskforce1Vessel2]
TaskForceModePlaceholderUnit=True
```

### Replaced — numbered slots
```ini
[Taskforce1Vessel1]
TaskForceModeAnchor=True
TaskForceModeReplacedUnitIndex=1

[Taskforce1Vessel2]
TaskForceModeReplacedUnitIndex=2   ; filled sequentially with player ships
```

---

## Rosters — `player_task_force_roster.ini`

Three unit categories populate the Task Force Builder. Format:
`unit_type=Variant/Squadron list|point_cost`
```ini
[AllowedVessels]
usn_ddg_kidd=Variant3,Variant4|30

[AllowedSubmarines]
usn_ssn_los_angeles=Variant1|35

[AllowedAircraft]
usn_p-3c=Squadron14,Squadron31|8

[AllowedHelicopters]
usn_sh-2f=Squadron6|4
```

**Each purchasable unit must declare its cost in its own unit `.ini`** (under `vessels\`, `aircraft\`, …):
```ini
[TaskForce]
TaskForceCost=27
LoadoutCost_Late=10
LoadoutCost_AntiShipHeavy=3
```
> ⚠️ Modded units without a `[TaskForce] TaskForceCost=` default to **0 points** — a common bug.

---

## Unit persistence

- **Automatic carry-forward:** surviving ships/subs/aircraft keep their damage, ammo, and crew XP between missions.
- **`JoinTaskForce=True`** — a mission unit permanently joins the player's force (at zero cost) if it survives debrief. Works for vessels, submarines, aircraft, helicopters — **not** land units or airbases.
  ```ini
  [Taskforce1Vessel3]
  Type=usn_avp_barnegat_mod
  VariantReference=Variant1
  JoinTaskForce=True
  ```
- **Reward units** — `TaskForceModeCompletionRewardedUnits=...` grants free units regardless of participation.

---

## Air tasking (pre-mission flight assignment)

```ini
; in [MissionN]: define flights — RoleId | DisplayName | AllowedUnitRoles | Slots | AllowedLoadouts
TaskForceModeAirTaskingAvailable=True
TaskForceModeAirTaskingFlight1=CAP|CAP|Fighter|2|AirToAir/AirToAirLongRange
TaskForceModeAirTaskingFlight2=Recon|Recon|MPA/ASW/ESM/AEW|1|ASW/Recon/AntiShip/AEW
```
```ini
; in the mission .ini: bind aircraft to those flight slots (they start airborne)
[Taskforce1Aircraft1]
TaskForceModeAirTaskingSlot=1
TaskForceModeAirTaskingRole=CAP
```
> Use unique keys `Flight1`, `Flight2`, `Flight3` — duplicating `Flight1` is a common mistake.

**Airbase prep** (needs a player land unit with "airbase"/"airfield" in its `Type`):
```ini
TaskForceModeAirbasePrepAvailable=True
TaskForceModeAirbasePrepReadySlots=2
TaskForceModeAirbasePrepInProgressSlots=4
```

---

## `commander_settings.ini` — progression, ranks, awards

### Nations & discounts
```ini
[CommanderSettings]
CommanderNations=US|Japan|Australia
CommanderDefaultNation=US
CommanderNameDefaultUS=Charles Robinson
CommanderNamePoolUS=Names_USA
SameNationUnitDiscount=0.2          ; 20% off units matching commander's nation
CommanderStartingRankLevel=1
```

### Officer ranks
```ini
[OfficerRanks]
; DisplayName, Abbrev, Grade, RankLevel, InsigniaImage
US=Ensign,ENS,O-1,1,ui/campaign/officer_ranks/usa/insignia_ens.png|Lieutenant,LT,O-3,3,ui/campaign/officer_ranks/usa/insignia_lt.png
```
Promotions trigger on reaching a `RankLevel` (mission action `TaskForceModeCommanderIncreaseRank=1`).

### Ribbons & medals
```ini
[TaskForceRibbons]
RibbonIds=combat_action_ribbon|navy_unit_commendation

[Ribbon_combat_action_ribbon]
Type=ServiceRibbon
Precedence=100                                     ; display order
Name_en=Combat Action Ribbon
ImagePath=campaigns/my-campaign/art/ribbons/combat_action_ribbon.png
MedalImagePath=campaigns/my-campaign/art/medals/combat_action_medal.png
CitationRecipient_en={CommanderRank} {CommanderName}
CitationText_en=For service as Commander, {TaskForceName}, during operations...
```
Citation tokens: `{CommanderRank}`, `{CommanderName}`, `{CommanderLastName}`, `{TaskForceName}`.
Award in a mission: `TaskForceModeRibbonAwards=combat_action_ribbon` (optionally `,US,Japan` nation-restricted).

Optional onboarding of a fresh commander:
```ini
TaskForceModeServiceRecordOnboarding=True
```

---

## First-campaign checklist

1. Create the `user\<mod>\campaigns\<name>\` structure — **never** edit `original\`.
2. `campaign.ini` → `[TaskForceMode] Enabled=True`.
3. At least one `[TaskForceModeDifficulty_*]` preset with a realistic point budget.
4. `player_task_force_roster.ini` with 3–5 unit types.
5. Confirm **every** purchasable unit has `[TaskForce] TaskForceCost=N` in its own `.ini`.
6. Mission `.ini` files with exactly **one** `TaskForceModeAnchor=True` player ship each.
7. `commander_settings.ini` with basic nation/rank data.

## Common mistakes
- Editing base files under `original\` (a patch wipes them).
- Forgetting `[TaskForceMode] Enabled=True`.
- Missing `TaskForceCost` on modded units → they cost 0.
- Listing a unit in `TaskForceModeAllowedRosterUnits` that isn't in the roster file.
- Reusing `TaskForceModeAirTaskingFlight1` instead of `Flight2`, `Flight3`.
- `JoinTaskForce=True` on land units / airbases (unsupported).
- Assuming `TaskForceModeRepair=True` auto-heals for free — it still costs points.
