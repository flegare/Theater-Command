# Sea Power Mission Companion & Safe Mission Installation Guide

## 1. Problem Overview: Why Browser .ini Warnings Happen

Modern chromium-based web browsers (Google Chrome, Microsoft Edge, Brave) and Windows SmartScreen security features classify Windows initialization files (`.ini`) with high risk because `.ini` files can theoretically alter local application configurations or legacy operating system parameters.

When users download generated Sea Power missions directly in the browser, Chrome often displays alarming popups such as:

- _"This type of file may harm your computer."_
- _"Discard / Keep dangerous download"_

Additionally, players must manually navigate deeply nested Steam game directories (`SteamLibrary\steamapps\common\Sea Power\Sea Power_Data\StreamingAssets\user\missions`) to paste and load their generated missions.

---

## 2. The Solution: Two-Layer Zero-Warning Architecture

`Theater-Command` provides a dual-layer solution:

1. **Safe Extension Renaming (`.mis` format)**:
   - Missions can be downloaded with the safe `.mis` extension, which Chrome and Windows treat as benign mission data with zero security warnings.
2. **Sea Power Mission Companion Extension (Manifest V3)**:
   - A browser extension running inside Chrome/Edge that communicates directly with Theater Command via secure local messaging.
   - Allows **1-Click Direct Installation**: When you click _"⚡ 1-Click Install (Companion)"_, the companion instantly writes the mission directly into your Sea Power user missions folder and renames it to native `.ini` without triggering any browser warning flags!

---

## 3. How to Install the Sea Power Mission Companion (Chrome / Edge / Brave)

### Step 1: Copy the Extension Directory Path

The companion extension is bundled directly inside your Theater Command installation:

```text
s:\SteamLibrary\steamapps\common\Sea Power\theater_campaign\extension
```

### Step 2: Open Extensions in Your Browser

- In **Google Chrome**: Navigate to `chrome://extensions`
- In **Microsoft Edge**: Navigate to `edge://extensions`
- In **Brave**: Navigate to `brave://extensions`

### Step 3: Enable Developer Mode

Look in the top-right corner of the extensions page and toggle the **Developer mode** switch to **ON**.

### Step 4: Load the Unpacked Extension

1. Click the **"Load unpacked"** button in the top left.
2. Browse to (or paste) the path: `s:\SteamLibrary\steamapps\common\Sea Power\theater_campaign\extension`.
3. Click **Select Folder**.
4. The extension **Sea Power Mission Companion (v1.0.0)** will appear in your extensions list!

### Step 5: Verify Connection

1. Open or refresh the Theater Command web app at `http://127.0.0.1:3100`.
2. Look at the top navigation bar: The status badge will display in green:
   ```text
   🔌 Companion: Active v1.0.0
   ```

---

## 4. Optional Power-User Tip: Instant Direct Game Linking (Directory Junction)

By default, Chrome downloads files into your browser default Downloads folder (e.g. `Downloads\SeaPower\user\missions`).

To have the Companion write **directly into Sea Power** without having to move any files manually, you can create a Windows Directory Junction (`mklink /J`).

1. Open **Command Prompt as Administrator** (Right-click Start -> Command Prompt (Admin) or Windows Terminal).
2. Run this single command:

```cmd
mklink /J "%USERPROFILE%\Downloads\SeaPower\user\missions" "s:\SteamLibrary\steamapps\common\Sea Power\Sea Power_Data\StreamingAssets\user\missions"
```

Once created, any mission dispatched by the Companion in Chrome automatically saves straight into your Sea Power game directory!

---

## 5. In-Game Loading Instructions

Once a mission is dispatched or downloaded:

1. Launch **Sea Power** via Steam.
2. In the Main Menu, click **Single Missions** -> **User Missions**.
3. Select your tactical engagement mission (e.g., `hex-battle-norway-4.ini`).
4. Click **Start Mission** to engage!
5. After concluding the tactical battle, return to Theater Command and click **Report Outcome** (Victory / Stalemate / Defeat) to apply battle aftermath, casualties, and territorial sovereignty to the grand campaign!
