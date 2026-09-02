# Sea Power — Modding & Scenario Documentation

A local reference library for creating **mods**, **missions/scenarios**, and **dynamic (Task Force Mode) campaigns** for _Sea Power: Naval Combat in the Missile Age_.

> Game AppID: **1286220** · Compiled 2026-07-22

---

## How Sea Power modding works (the 30-second version)

Sea Power is **file-override based**, not script/code based. You don't compile anything.

- All content lives under `Sea Power_Data\StreamingAssets\`.
- `original\` = the base game (**never edit this directly**).
- `user\` = your saves and your local mods.
- A mod is just a **folder of files** that _shadow_ files of the same name in `original\`, based on **load order** set in the in-game **Mod Manager**.
- Almost everything is a plain-text **`.ini`** file editable in Notepad / VS Code. (Only 3D model files are binary.)
- A **mission/scenario** is a single `.ini` file with sections for units (`[Taskforce1Vessel1]`) and scripting (`[Trigger1]`).

So: to make content, you create a folder in `StreamingAssets`, drop `.ini` files in it, test locally via the Mod Manager, then optionally upload to the Steam Workshop.

---

## Contents of this folder

| File                                                                                               | What it covers                                                                                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`01-modding-overview.md`](01-modding-overview.md)                                                 | Folder structure, load order, Mod Manager, Workshop upload, `_info.ini` localization                                  |
| [`02-mission-scenario-guide.md`](02-mission-scenario-guide.md)                                     | Anatomy of a mission `.ini`: environment, taskforces, units, objectives, triggers                                     |
| [`03-triggers-and-conditions.md`](03-triggers-and-conditions.md)                                   | Quick reference for the trigger/condition system (full detail in the official `.docx`)                                |
| [`04-dynamic-campaign-guide.md`](04-dynamic-campaign-guide.md)                                     | **Task Force Mode** persistent campaigns: rosters, points, commanders, ribbons, mission generation                    |
| [`07-world-war-theater-northstar.md`](07-world-war-theater-northstar.md)                           | North-star requirements for an external NATO vs Pact world-war theater campaign layer                                 |
| [`08-world-war-theater-implementation-backlog.md`](08-world-war-theater-implementation-backlog.md) | Prescriptive, dependency-ordered implementation packets and acceptance gates for lower-tier coding models             |
| [`10-spy-ship-surrender-plan.md`](10-spy-ship-surrender-plan.md)                                   | Staged plan for credible AGI surrender behaviour, including validation gates and the optional boarding-boat follow-up |
| [`anchor-chain/`](anchor-chain/README.md)                                                          | **Anchor Chain** C# mod loader & plugin framework documentation (BepInEx 5, HarmonyX, Doorstop)                       |
| [`examples/`](examples/)                                                                           | A real base-game mission `.ini` copied verbatim as a working reference                                                |
| [`official/`](official/)                                                                           | The game's **own** shipped documentation (PDF + DOCX) — see below                                                     |

### Official docs (shipped with the game, copied here for convenience)

| File                                                    | Notes                                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `official/SeaPower_Manual_en.pdf`                       | Full 19 MB player manual (English)                                                           |
| `official/SeaPower_Manual_de.pdf`                       | German manual                                                                                |
| `official/Mission Editor. Triggers and conditions.docx` | **The authoritative trigger/condition reference** — read this before doing complex scripting |
| `official/Localization HowTo.pdf`                       | How the multi-language `[Language_xx]` blocks work                                           |
| `official/Camera controls.pdf`                          | Camera / view controls                                                                       |

> These are copies. The live originals are at:
> `Sea Power_Data\StreamingAssets\original\documentation\`

---

## Quick start recipes

**Make a standalone scenario:**

1. Create `StreamingAssets\user\my_scenarios\missions\my_first_mission.ini`
2. Copy the structure from [`examples/example_mission_Officer_Training_1.ini`](examples/example_mission_Officer_Training_1.ini)
3. Launch → Mod Manager → enable → it appears in the mission list. See [`02-mission-scenario-guide.md`](02-mission-scenario-guide.md).

**Make a dynamic campaign:**

1. Create `StreamingAssets\user\my_campaign\campaigns\my-campaign\campaign.ini` with `[TaskForceMode] Enabled=True`
2. Build a roster + commander settings + mission files. See [`04-dynamic-campaign-guide.md`](04-dynamic-campaign-guide.md).
3. Reference implementation: the base game's Task Force campaign under `original\campaigns\`.

---

## Primary sources

- Official shipped docs (in `official/`)
- [Steam Guide — _Sea Power Mod Creation Guide_](https://steamcommunity.com/sharedfiles/filedetails/?id=3364482257)
- [Steam Guide — _Task Force Mode Campaign Creation_](https://steamcommunity.com/sharedfiles/filedetails/?id=3756769210)
- [Sea Power Steam Community — Modding hub](https://steamcommunity.com/app/1286220/discussions/3/)
- [Sea Power on Wikipedia](<https://en.wikipedia.org/wiki/Sea_Power_(video_game)>)
