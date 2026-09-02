# Installing Anchor Chain

This guide covers setting up the Anchor Chain preloader and BepInEx runtime for _Sea Power_.

---

## Installation Steps

### Step 1: Obtain the Preloader Package

Extract the preloader files from `ACPreloader.zip` (located in the root directory of Sea Power or downloaded from the official repository/Workshop).

### Step 2: Extract to Game Root Directory

Copy the following files and directories into your main _Sea Power_ root folder (e.g., `S:\SteamLibrary\steamapps\common\Sea Power\`):

```
Sea Power/
├── BepInEx/
│   ├── core/
│   ├── patchers/
│   └── plugins/
├── .doorstop_version
├── doorstop_config.ini
└── winhttp.dll
```

> **Note:** Ensure `winhttp.dll` is placed in the exact same directory as `Sea Power.exe`.

### Step 3: Verify Configuration

Open `doorstop_config.ini` and verify that the target assembly path is correctly set:

```ini
[General]
enabled = true
target_assembly = BepInEx\core\BepInEx.Preloader.dll
```

### Step 4: First Launch Verification

1. Launch _Sea Power_.
2. Allow the game to reach the main menu, then exit.
3. Check `BepInEx/LogOutput.log`. You should see lines confirming successful loader initialization:

```
[Message:   BepInEx] Preloader started
[Message:   BepInEx] Chainloader ready
[Info   :AnchorChain Preloader] AnchorChain Preloader started!
```

---

## Linux / Steam Deck Setup (Proton)

If running under Linux / Steam Deck via Valve Proton:
Add the DLL override command to Sea Power's Steam Launch Options:

```sh
WINEDLLOVERRIDES="winhttp=n,b" %command%
```

This instructs Proton / Wine to use the native `winhttp.dll` proxy provided by Doorstop rather than the system built-in DLL.
