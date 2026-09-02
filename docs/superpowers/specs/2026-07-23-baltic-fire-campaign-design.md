# Baltic Fire — Campaign Design Spec

*Task Force Mode dynamic campaign for Sea Power. Working title: **Baltic Fire**. Date: 2026-07-23.*

## Premise
August 1985. The Warsaw Pact opens WW3 with a surprise amphibious grab for the **Danish straits** — the Baltic's exits — to bottle up NATO and destroy the Bundesmarine in detail. **COMNAVBALTAP can only *slow* the assault in the west.** The campaign is a fighting retreat in the Kiel/Danish narrows that turns into a counter-punch driving **east** along the GDR and Polish coast, and climaxes with the crippling and **capture of a Soviet light carrier** off Kaliningrad, which becomes the player's flagship.

The player commands a growing West German-led NATO task group (COMNAVBALTAP / TG Baltic Approaches).

## Design goals (from the user)
- Western Baltic opening with **small ships + coastal action** (fjords rejected — geographically Norwegian; Finland/Sweden have no vanilla ships).
- **Gradation** of force tiers, small → capital, mirroring Pacific Strike '85.
- **Pivot/branch missions** that remove enemy assets to ease later stages (à la Pacific 03A/07A).
- Escalation moves **east** (player action only delays the WP tide in the west).
- Carrier finale solved **in-world** by capturing a Soviet carrier — vanilla units only.

## Faction & unit basis (all vanilla)
**Player (Blue), `fgs_` + attached NATO:**
| Tier | Units |
|------|-------|
| 1 Green water | `fgs_ptg_tiger` (Tiger FPB, Exocet) · `fgs_ss_type_205` / `fgs_ss_type_206` (SSK) · minesweepers · coastal guns (land) |
| 2 Escort SAG | `fgs_ddg_lutjens` (DDG) · attached `usn_ffg_oliver_hazard_perry` / `usn_ff_knox` · `usn_ssn_sturgeon` · P-3 MPA |
| 3 Capital | **captured `wp_takr_kiev`** (Kiev-class, Yak-38 + Ka-27) leading a combined NATO group |

**Enemy (Red), all `wp_` (Soviet + E. German Volksmarine + Polish):** `wp_bdk_ropucha`/`wp_bdk_alligator`/`wp_bdk_ivan_rogov` (amphib) · `wp_ptg_osa2`/`wp_ptg_tarantul`/`wp_mrk_nanuchka`/`wp_mpk_grisha3` (escorts) · `wp_ss_foxtrot`/`wp_ss_kilo` (subs) · `wp_tu-22m2`/`wp_tu-16k`/`wp_su-24` (naval air) · `wp_silkworm_launcher`/`wp_sam_site_sa-5` (coast).

Unit `Nation=Germany` (flag_ger) for player; enemy units inherit nation from their variant.

## Mission arc (linear spine + 2 optional asset-removal pivots)
1. **Fehmarn Belt** — Tiger boats + Type 206s + coastal guns ambush the WP amphibious vanguard in the narrows. *Small ships, coastal, delay.* ← **built first as the vertical slice.**
2. **The Great Belt** — Fighting retreat through the Danish chokepoint; minefields; first heavy air threat.
3. **Kiel Bight** — Hold the home base under Backfire/Badger raids; first US reinforcements.
   - **3A · Silent Wolf** *(pivot)* — lone Type 206 hunts the **Ivan Rogov** flagship before it lands its marines → fewer WP ground/coastal assets in missions 4–5.
4. **Bornholm** — Counterattack pushes east; NATO SAG vs. Nanuchka/Grisha screen.
   - **4A · Iron Hand** *(pivot)* — US A-6E/A-7E strike craters a WP coastal airbase → cuts the Backfire/Badger threat for the finale.
5. **The Baku Gambit** — Disable the Soviet carrier without sinking → carrier + airwing join the force.
6. **Under New Colors** — Defend the crippled prize from a Soviet re-sink attempt; learn the Yak-38s.
7. **Baltiysk** — Finale: carrier SAG strikes the Soviet Baltic Fleet fortress (Kaliningrad) — Silkworm sites, SA-5, ships in port. *Coastal climax.*

## Key mechanics (verified against shipping files)
- **Campaign = event-timeline DAG.** `[MissionN]` nodes are `Type=FreeEvent` (slideshow/news) or `Type=Mission`, linked by `Parents=`, gated by `RequiredResult=`. Branches (3A/4A) are alternate `Parents` children.
- **Persistence:** surviving units carry damage/ammo/XP forward automatically; `JoinTaskForce=True` folds a mission unit into the force at zero cost.
- **Carrier capture:** `Action_UnitTransferToTaskforce=Taskforce1` + `Action_Units=<Kiev>` on a "disabled" condition side-changes the ship mid-mission (this is exactly how Okinawa's Trigger5 flips a merchant on ID). Combined with `JoinTaskForce=True` to persist.
  - **Reliable fallback** if transfer+persist proves fragile in testing: disable = objective, then grant the carrier via `TaskForceModeCompletionRewardedUnits`, narrated as a prize crew towing it to Kiel.
- **Asset-removal pivots:** success in 3A/4A sets campaign variables / removes units so missions 4–7 spawn with reduced WP forces.

## Economy (small-ship scale, lower than Pacific's 500)
Difficulty presets Easy/Moderate/Difficult with StartingPoints ~180/140/100. Explicit per-unit `|cost` in the roster (avoids the 0-cost bug on less-common units). Harpoon/heavier loadouts unlock mid-campaign.

## Build status / open items (first-load test)
- **Built this pass:** folder scaffold, `campaign.ini` (presets + Mission 1 node), `player_task_force_roster.ini`, minimal `commander_settings.ini`, playable **Mission 01 Fehmarn Belt**.
- **Placeholders (ship-safe base art reused, flagged in files):** German rank insignia → USA insignia art; navy emblem → USN; name pool → Names_USA; ribbons omitted for now.
- **To verify on first load:** nation code `Germany` accepted by commander settings; name pool resolves; mission loads and is winnable; chosen unit variants are era-appropriate.
- **Next:** missions 02–07 + pivots, German art assets, difficulty/economy tuning, briefing XML.

> Note: the game folder is not a git repo, so this spec is saved but not committed.
