# Anchor Chain — Modder Documentation & API Reference

## Core Concepts for Developers

When developing plugins for *Sea Power*, Anchor Chain provides runtime initialization, harmony patching hooks, and access to Sea Power's core assemblies:

- `Assembly-CSharp.dll` — Core game logic (units, weapons, sensors, UI, mission engine).
- `UnityEngine.CoreModule.dll` — Unity engine core APIs.
- `BepInEx.dll` — Plugin lifecycle and logging.
- `0Harmony.dll` — HarmonyX method interception.

---

## Game Engine Context

Sea Power runs on **Unity Engine** with C# Mono/IL2CPP Managed assemblies.

Key namespaces and types commonly patched:
- `ScriptRuntime` — Handles mission scripting and INI parsing.
- `World` / `Zone` — World scale coordinates and environment rendering.
- `Group` — Task group management and unit formation logic.
- `IniContext` / `IniHelpers` — Parsing configuration files and custom attributes.

---

## Plugin Lifecycle

1. **Preloader:** Fires before `UnityEngine` initializes.
2. **Chainloader:** Instantiates types inheriting from `BaseUnityPlugin` decorated with `[BepInPlugin]`.
3. **Awake():** Main entry point for plugin initialization and register Harmony patches.
4. **Start() / Update():** Standard MonoBehaviour callbacks.

---

## Harmony Patch Types

- **Prefix Patch (`[HarmonyPrefix]`):** Runs before target method. Can modify parameters or skip target method execution by returning `false`.
- **Postfix Patch (`[HarmonyPostfix]`):** Runs after target method. Can modify return values or inspect output state.
- **Transpiler Patch (`[HarmonyTranspiler]`):** Modifies IL bytecode directly for precise surgical adjustments.
