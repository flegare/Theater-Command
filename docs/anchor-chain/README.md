# Anchor Chain — Sea Power Mod Loader Documentation

**Anchor Chain** is a community-developed chainloader and modding framework for _Sea Power: Naval Combat in the Missile Age_. It utilizes **BepInEx 5** and **HarmonyX** to enable custom code execution, C# plugin loading, and runtime patching for advanced mods (such as custom ship models, loadout managers, weapon behaviors, and mechanics beyond base INI overrides).

---

## Document Index

1. [`01-getting-started.md`](01-getting-started.md) — Introduction to Anchor Chain, architecture overview, and core concepts.
2. [`02-install-anchor-chain.md`](02-install-anchor-chain.md) — Step-by-step installation instructions for the preloader and BepInEx runtime.
3. [`03-installing-mods.md`](03-installing-mods.md) — How to install, enable, and order Anchor Chain C# plugins and Steam Workshop mods.
4. [`04-modder-documentation.md`](04-modder-documentation.md) — Developer reference for writing code mods against the Sea Power Unity engine runtime.
5. [`05-writing-a-basic-plugin.md`](05-writing-a-basic-plugin.md) — Hands-on tutorial for building your first C# BepInEx plugin with Harmony patches.
6. [`06-integrating-multiple-plugins.md`](06-integrating-multiple-plugins.md) — Guidelines for avoiding method patch conflicts, dependency management, and compatibility across multiple plugins.

---

## Preloader Files Summary

When correctly installed in the Sea Power root directory (`S:\SteamLibrary\steamapps\common\Sea Power\`), Anchor Chain consists of:

- `winhttp.dll` — Proxy DLL for Unity Doorstop injection.
- `doorstop_config.ini` — Configuration setting target assembly to `BepInEx\core\BepInEx.Preloader.dll`.
- `.doorstop_version` — Doorstop runtime marker.
- `BepInEx/` — Directory containing core loader, patchers, and `plugins/` folder for C# mod DLLs.
- `ACPreloader.zip` — Standalone preloader package containing initial setup files.
