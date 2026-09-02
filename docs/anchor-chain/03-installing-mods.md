# Installing and Managing Mods with Anchor Chain

## Types of Anchor Chain Mods

Anchor Chain supports two primary deployment methods for C# plugins:

1. **Local Plugin Installation:** Manual installation into `BepInEx/plugins/`.
2. **Steam Workshop Mods:** Automated download and loading via Steam Workshop integration.

---

## Installing Manual Local Plugins

1. Download the plugin package (usually a `.dll` file or a folder containing `.dll` files and assets).
2. Place the `.dll` file into:
   ```
   Sea Power/BepInEx/plugins/
   ```
   *Example:* `Sea Power/BepInEx/plugins/MyCustomPlugin/MyCustomPlugin.dll`
3. Launch the game.

---

## Steam Workshop Plugins

When you subscribe to an Anchor Chain-enabled mod on Steam Workshop:
- Steam downloads the mod into `steamapps/workshop/content/1286220/<ModID>/`.
- Anchor Chain automatically scans Workshop item folders for `BepInEx` plugins or `.dll` assemblies and loads them at startup.

---

## Configuration and Logs

- **Plugin Settings:** Many plugins generate configuration files upon first launch. These are saved in:
  ```
  Sea Power/BepInEx/config/
  ```
  Configurations use standard `.cfg` format and can be edited with Notepad or VS Code.

- **Diagnostics & Troubleshooting:**
  If a mod fails to load or crashes, open `BepInEx/LogOutput.log` to inspect errors, stack trace reports, or missing dependency warnings.
