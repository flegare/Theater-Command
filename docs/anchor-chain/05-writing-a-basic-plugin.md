# Tutorial: Writing a Basic Anchor Chain Plugin

This step-by-step guide demonstrates how to create a basic C# plugin for _Sea Power_ using Anchor Chain, BepInEx 5, and Harmony.

---

## Prerequisites

- .NET Framework 4.7.2 or .NET Standard 2.0 SDK
- IDE: Visual Studio 2022, JetBrains Rider, or VS Code
- Sea Power assemblies located in `Sea Power_Data/Managed/`:
  - `Assembly-CSharp.dll`
  - `UnityEngine.dll`
  - `UnityEngine.CoreModule.dll`
  - `BepInEx.dll`
  - `0Harmony.dll`

---

## 1. Project Setup (`.csproj`)

Create a C# Class Library project with the following configuration:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net472</TargetFramework>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>

  <ItemGroup>
    <Reference Include="BepInEx">
      <HintPath>$(SeaPowerDir)\BepInEx\core\BepInEx.dll</HintPath>
    </Reference>
    <Reference Include="0Harmony">
      <HintPath>$(SeaPowerDir)\BepInEx\core\0Harmony.dll</HintPath>
    </Reference>
    <Reference Include="UnityEngine.CoreModule">
      <HintPath>$(SeaPowerDir)\Sea Power_Data\Managed\UnityEngine.CoreModule.dll</HintPath>
    </Reference>
    <Reference Include="Assembly-CSharp">
      <HintPath>$(SeaPowerDir)\Sea Power_Data\Managed\Assembly-CSharp.dll</HintPath>
    </Reference>
  </ItemGroup>
</Project>
```

---

## 2. Plugin Entry Point (`Plugin.cs`)

```csharp
using BepInEx;
using HarmonyLib;

namespace MyFirstSeaPowerMod
{
    [BepInPlugin(PluginInfo.PLUGIN_GUID, PluginInfo.PLUGIN_NAME, PluginInfo.PLUGIN_VERSION)]
    public class Plugin : BaseUnityPlugin
    {
        public const string PLUGIN_GUID = "com.author.myfirstseapowermod";
        public const string PLUGIN_NAME = "My First Sea Power Mod";
        public const string PLUGIN_VERSION = "1.0.0";

        private void Awake()
        {
            Logger.LogInfo($"Plugin {PLUGIN_NAME} version {PLUGIN_VERSION} loaded!");

            // Apply Harmony patches
            var harmony = new Harmony(PLUGIN_GUID);
            harmony.PatchAll();
        }
    }
}
```

---

## 3. Creating a Harmony Patch (`Patches.cs`)

Example patch intercepting a method in `ScriptRuntime` or game engine to log mission loading events:

```csharp
using HarmonyLib;
using BepInEx.Logging;

namespace MyFirstSeaPowerMod
{
    [HarmonyPatch(typeof(ScriptRuntime), "GetIniNames")]
    public static class ScriptRuntimePatch
    {
        [HarmonyPrefix]
        public static void Prefix()
        {
            UnityEngine.Debug.Log("[MyFirstSeaPowerMod] ScriptRuntime initializing mission INI files!");
        }
    }
}
```

---

## 4. Building and Deploying

1. Build the project to produce `MyFirstSeaPowerMod.dll`.
2. Copy `MyFirstSeaPowerMod.dll` into `Sea Power/BepInEx/plugins/MyFirstSeaPowerMod/`.
3. Launch Sea Power and verify log output in `BepInEx/LogOutput.log`.
