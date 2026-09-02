# Integrating Multiple Plugins with Anchor Chain

When running multiple code mods simultaneously in *Sea Power*, conflicts can occur if two plugins attempt to modify the same internal method or override the same game system. Anchor Chain provides guidelines for multi-plugin harmony integration.

---

## Best Practices for Multi-Plugin Compatibility

### 1. Prefer Selective Prefixes & Postfixes Over Overrides
- Avoid returning `false` from `[HarmonyPrefix]` unless strictly necessary, as skipping original method execution prevents other plugins' prefixes/postfixes from executing.
- Use `[HarmonyPostfix]` to modify results after original method execution whenever possible.

### 2. Declare Dependencies Explicitly
If your plugin relies on another plugin (e.g. LoadoutManager or custom model loaders), declare dependency attributes:

```csharp
[BepInDependency("com.author.loadoutmanager", BepInDependency.DependencyFlags.HardDependency)]
[BepInPlugin(PLUGIN_GUID, PLUGIN_NAME, PLUGIN_VERSION)]
public class Plugin : BaseUnityPlugin
```

### 3. Handle Soft Dependencies
If an external plugin is optional, check for its presence at runtime before making API calls:

```csharp
if (BepInEx.Bootstrap.Chainloader.PluginInfos.ContainsKey("com.author.optionalmod"))
{
    // Enable optional integration features
}
```

### 4. Patch Safety and Exception Handling
Wrap non-critical hook logic inside `try-catch` blocks so that a failure in one plugin does not crash the entire game loop or prevent other mods from running:

```csharp
[HarmonyPostfix]
public static void Postfix()
{
    try
    {
        // Custom feature logic
    }
    catch (System.Exception ex)
    {
        UnityEngine.Debug.LogError($"[MyMod] Error during hook execution: {ex}");
    }
}
```
