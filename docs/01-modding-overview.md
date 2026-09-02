# 01 — Modding Overview: Folders, Load Order & Workshop

*Sources: game's shipped docs + [Steam Mod Creation Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3364482257).*

---

## 1. Where everything lives

```
Sea Power\
└─ Sea Power_Data\
   └─ StreamingAssets\
      ├─ original\      ← BASE GAME. Read for reference, NEVER edit.
      │  ├─ aircraft\        ammunition\   campaigns\   documentation\
      │  ├─ formations\      land_units\   missions\    systems\
      │  ├─ vessels\         templates\    ui\          language_en\ ...
      │  └─ _info.ini, config.ini, environment.ini, nations_reference.ini ...
      ├─ user\          ← Your saves + your local mods live here.
      └─ (workshop mods load from Steam\steamapps\workshop\content\1286220\)
```

Everything except 3D model files is a plain-text **`.ini`** file. Open with Notepad, Notepad++, or VS Code.

### The mirror principle
A mod folder **mirrors the structure of `original\`**. To change a vessel, you place a file at the same relative path inside your mod folder. To add a mission, you place `missions\my_mission.ini` inside your mod folder. The game searches enabled folders in load order and uses the **first** match it finds.

---

## 2. Anatomy of a mod folder

Steam requires you to upload a **single top-level folder**. Recommended layout:

```
StreamingAssets\
└─ user\
   └─ my_username_superduper_pack\      ← top-level (this is what you upload)
      ├─ _info.ini                        ← display name + description (see §4)
      ├─ preview.png                      ← Workshop thumbnail (<1 MB, square)
      └─ missions\
         └─ superduper_mission_pack\      ← optional grouping folder in the mission list
            ├─ mission_01.ini
            ├─ mission_02.ini
            └─ mission_01_briefing\       ← briefing text/map assets (optional)
```

- The nesting under `missions\` is optional; a subfolder just groups related missions together in the UI.
- Mirror any folder you want to override: `vessels\`, `aircraft\`, `ammunition\`, `systems\`, `campaigns\`, etc.

---

## 3. The Mod Manager & load order

Reached from the main menu. It lists all local and Workshop mods.

- **Checkbox** = enabled/disabled.
- **Source tag** = `Local` (in `user\`) or `Workshop` (subscribed).
- **Reorder buttons** = change the search order. Files in a **higher** mod win conflicts.
- `original` and `user` are fixed anchors in the order.
- **Create Mod** button = active only when Steam is running and connected.

**Rule of thumb:** if two mods edit the same file, the one higher in the list takes effect. Put your overrides above the things they should override.

---

## 4. `_info.ini` — naming your mod

On first upload a mod shows only its numeric Steam ID. Add `_info.ini` at the **top level** of your mod folder to give it a proper name/description per language:

```ini
[Language_en]
Name=Super Duper Mission Pack
Description=Ten Cold War what-if scenarios in the Norwegian Sea.

[Language_de]
Name=Super-Duper-Missionspaket
Description=Zehn Was-wäre-wenn-Szenarien in der Norwegischen See.

[Language_ru]
Name=...
Description=...

[Language_cn]
Name=...
Description=...

[Language_fr]
Name=...
Description=...

[Language_es]
Name=...
Description=...
```

Only `Language_en` is strictly required; others fall back to English.

---

## 5. Uploading to the Steam Workshop

From the Mod Manager → **Create Mod**:

| Field | Notes |
|-------|-------|
| **Pick Folder** | Select your top-level mod folder in `user\`. |
| **Mod Name** | Workshop title. |
| **Mod Description** | Shown under the preview image. |
| **Preview Image** | < 1 MB, ideally square. |
| **Change Log** | Appears when updating an existing mod (optional but recommended). |
| **Visibility** | Public (default) / friends / private. |
| **Update Existing** | Searches the first 50 mods tied to your SteamID so you can update instead of re-uploading. |

Click **Submit Mod** → the Steam client opens the submission page to confirm. Uploaded mods land at:
`Steam\steamapps\workshop\content\1286220\<ModID>\`

> Subscribers auto-download, but the download may not finish before the game loads; the game re-checks on startup (which can slow loading).

---

## 6. Practical tips

- **Never edit `original\`.** A game update overwrites it and you lose your work. Always work in `user\`.
- **Copy, don't author from scratch.** Duplicate a working base-game file and modify it — see `examples/`.
- **Test locally first.** A local mod in `user\` shows up in the Mod Manager immediately; no upload needed to playtest.
- **Watch case & paths.** `.ini` keys and relative asset paths must match exactly.
- **Keep IDs unique.** Unit `Type=` values reference definitions in `vessels\`/`aircraft\`; use existing IDs unless you're also adding new unit definitions.
