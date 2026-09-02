# Anchor Chain — Getting Started

## What is Anchor Chain?

**Anchor Chain** is a code-modding framework and chainloader designed specifically for *Sea Power: Naval Combat in the Missile Age*. 

While standard Sea Power modding relies on `.ini` file shadowing in `StreamingAssets`, Anchor Chain enables **C# code modification**, runtime IL patching via **HarmonyX**, and custom assembly injection via **BepInEx 5**.

### Key Features
- **Code Execution:** Run custom C# DLL plugins inside the Sea Power Unity process.
- **HarmonyX Patching:** Intercept, modify, or override base game methods at runtime without altering game files on disk.
- **Assembly Loading:** Load custom 3D models, assets, UI panels, and weapon logic into game scenes.
- **Workshop Integration:** Load plugins downloaded from the Steam Workshop or placed locally in `BepInEx/plugins/`.

---

## When Do You Need Anchor Chain?

- **INI/Data Mods (No Anchor Chain needed):** Simple scenario files, unit stat edits, custom missions, or texture/sound overrides handled by the native Mod Manager.
- **Code/System Mods (Anchor Chain required):** New gameplay mechanics, custom UI panels, advanced loadout managers, custom AI behaviors, external tool integration, or custom asset bundle loaders.

---

## Architecture Overview

```
Sea Power.exe (Unity Engine)
  │
  ├── winhttp.dll (Unity Doorstop Proxy)
  │     └── Reads doorstop_config.ini
  │           └── Loads BepInEx\core\BepInEx.Preloader.dll
  │
  └── BepInEx Chainloader
        ├── Executes preloader patchers
        ├── Scans BepInEx\plugins\ for *.dll
        └── Loads plugins into Unity Domain
```

---

## Quick Reference Links
- Documentation Home: [`README.md`](README.md)
- Installation Guide: [`02-install-anchor-chain.md`](02-install-anchor-chain.md)
- Plugin Development: [`05-writing-a-basic-plugin.md`](05-writing-a-basic-plugin.md)
