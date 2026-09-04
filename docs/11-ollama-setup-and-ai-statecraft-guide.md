# Ollama Setup & Strategic AI Statecraft Guide

This guide explains how to install, configure, and operate **Ollama** alongside the **Sea Power Theater Campaign** application.

---

## 1. What Ollama Does in the Campaign

The Theater Campaign features an autonomous diplomatic negotiation engine and foreign ministry simulation. When you transmit diplomatic cables, negotiate ceasefires, request basing rights, or propose multi-asset tribute treaties, the recipient nation evaluates your terms using:

1. **National Strategic Stance & Persona**:
   - **Soviet Union / Politburo**: Suspicious of NATO encirclement, demands buffer zones and fuel quotas.
   - **Sweden / Försvarsmakten**: Neutrality preservation, highly sensitive to submarine incursions.
   - **Finland / Valtioneuvosto**: Pragmatic Finnish-Soviet Friendship Treaty compliance, avoids provocation.
   - **United States / NATO SHAPE**: Atlantic sea lane reinforcement, GIUK gap defense.
   - **United Kingdom / MoD**: North Sea oilfield protection, anti-submarine warfare.
2. **Authentic Ambassadorial Communiqués**:
   - Rather than canned strings, the LLM generates real Cold War telegrams, diplomatic dialogue, rationale, and dynamic counter-offers matching historical tone.
3. **Structured JSON Output**:
   - Uses Ollama's structured JSON mode (`format: "json"`) to evaluate acceptance odds, adjust terms, and propose compensatory counter-offers.

---

## 2. Installing Ollama

Ollama is a lightweight, local LLM runner available for Windows, macOS, and Linux.

### Windows Installation

1. Download the Windows installer from [ollama.com/download](https://ollama.com/download).
2. Run `OllamaSetup.exe` and follow the on-screen installer.
3. Once installed, Ollama will run in the Windows system tray and expose an HTTP API at `http://127.0.0.1:11434`.

### Verification

Open PowerShell or Command Prompt and run:

```powershell
ollama --version
```

You should see `ollama version 0.x.x`.

---

## 3. Recommended Models

The Theater Campaign prompts models using system and user roles formatted for JSON responses. The following models have been tested and verified:

| Model              | Size / VRAM  | Pull Command           | Recommendation                                                                |
| :----------------- | :----------- | :--------------------- | :---------------------------------------------------------------------------- |
| **Gemma 3 (4B)**   | ~3 GB VRAM   | `ollama run gemma3:4b` | **Fastest & Highly Recommended** for laptops and fast turns (< 1.5s latency). |
| **Llama 3.1 (8B)** | ~5.5 GB VRAM | `ollama run llama3.1`  | **Excellent Cold War diplomat tone** and counter-offer negotiation.           |
| **Mistral (7B)**   | ~5 GB VRAM   | `ollama run mistral`   | Reliable JSON structuring and diplomatic vocabulary.                          |
| **Qwen 2.5 (7B)**  | ~5 GB VRAM   | `ollama run qwen2.5`   | Precise economic counter-term calculations.                                   |

To download your chosen model, simply run in your terminal:

```powershell
ollama pull gemma3:4b
```

---

## 4. Configuring the Theater Campaign

The application automatically checks for Ollama on startup. You can customize the connection using environment variables or a `.env` file in the project root:

| Variable            | Default Value            | Description                                                                                 |
| :------------------ | :----------------------- | :------------------------------------------------------------------------------------------ |
| `OLLAMA_URL`        | `http://127.0.0.1:11434` | The HTTP endpoint where Ollama is listening.                                                |
| `OLLAMA_MODEL`      | _(Auto-detected)_        | Model name to use. If unset, the server automatically detects whichever model is installed. |
| `OLLAMA_TIMEOUT_MS` | `120000` (120 sec)       | Maximum time to wait for a completion before falling back to heuristic AI.                  |

### Example `.env` File

```env
PORT=3100
HOST=127.0.0.1
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
LOG_LEVEL=info
```

---

## 5. Automatic Model Detection & Web UI Indicator

When you launch the web dashboard at `http://127.0.0.1:3100`:

- **Top Right Header**: You will see a status badge:
  - `🟢 LLM: gemma3:4b (Online)` — Ollama is connected, model is loaded into memory, and ready for sub-second responses.
  - `⚪ LLM: Offline` — Ollama is not detected; the application is using the built-in heuristic AI.

---

## 6. Zero-Config Heuristic Fallback

**Is Ollama required to play the campaign?**
**No.** If Ollama is not installed, not running, or times out, the Theater Campaign does **not** crash or fail:

- It seamlessly engages the **Deterministic Heuristic Strategic AI**.
- Calculates diplomatic odds using tension index, alliance posture, asset contributions, and historical redlines.
- Produces authentic, period-accurate Soviet Politburo, Scandinavian, and NATO telegrams.
- Supports the full counter-offer, multi-asset tribute adjustment, and treaty ratification loop.

---

## 7. Troubleshooting

### Problem: Badge shows `⚪ LLM: Offline`

1. Check if Ollama is running:
   ```powershell
   curl http://127.0.0.1:11434/api/tags
   ```
2. If it is not running, launch it from the Windows Start menu or run `ollama serve`.
3. Check if any model is installed:
   ```powershell
   ollama list
   ```
   If the list is empty, run `ollama pull gemma3:4b`.

### Problem: Responses are slow

- If you have an NVIDIA GPU, make sure Ollama is utilizing CUDA (check Windows Task Manager > Performance > GPU).
- Switch to a smaller model: `ollama pull gemma3:4b` or `ollama pull llama3.2:3b`.
- In `.env`, set `OLLAMA_MODEL=gemma3:4b`.
