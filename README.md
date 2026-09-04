# Sea Power: Theater Command

**Sea Power: Theater Command** is an autonomous grand-strategic campaign simulation and dynamic mission generator designed for _Sea Power: Naval Combat in the Missile Age_.

It bridges theater-level national statecraft, Cold War naval logistics, and tactical combat sorties across a GIS-accurate hexagonal simulation of the Northern Flank, North Sea, Baltic approaches, and the Kola Peninsula.

---

## 🚀 Quick Start Guide

### Prerequisites

- **Node.js**: v20.x or later installed (`node -v`).
- **Git**: For source version control.
- _(Optional)_ **Ollama**: For local LLM-powered diplomatic negotiations.

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone git@github.com:flegare/Theater-Command.git
cd Theater-Command
npm install
```

### 2. Running the Application

#### Option A: Development Server (Hot Reloading)

```bash
npm run dev
```

Starts both the Express API backend and Vite client on **`http://127.0.0.1:3100`**.

#### Option B: Production Build

```bash
npm run build
npm start
```

Compiles TypeScript, bundles web assets with Vite, and serves the unified web client on **`http://127.0.0.1:3100`**.

---

## 🤖 LLM Integration & Ollama Setup

The simulation features an autonomous diplomatic negotiation engine where foreign powers evaluate ceasefires, non-aggression treaties, basing rights, and multi-asset tribute demands.

### Installing Ollama

1. Download Ollama from **[ollama.com/download](https://ollama.com/download)** (Windows, macOS, or Linux).
2. Install and ensure the service is running. It exposes an API on `http://127.0.0.1:11434`.
3. Pull a recommended model in your terminal:
   ```bash
   # Recommended for fast turns and low VRAM (~3 GB)
   ollama pull gemma3:4b

   # Recommended for deeper Cold War diplomatic dialogue (~5.5 GB VRAM)
   ollama pull llama3.1:8b
   ```

### Configuration Options

The server automatically detects active Ollama models. You can optionally set custom parameters via environment variables or a `.env` file:

```env
PORT=3100
HOST=127.0.0.1
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
```

### Zero-Config Heuristic Fallback

**You do NOT need Ollama installed to run the game.** If Ollama is offline or not installed:

- The server automatically detects this on startup and displays `⚪ LLM: Offline` in the UI header.
- The game automatically switches to the built-in **Cold War Heuristic Statecraft AI**, providing deterministic, authentic diplomatic evaluations, counter-offers, and cables without errors.

For detailed model benchmarks, troubleshooting, and custom prompts, see the **[Ollama Setup & AI Statecraft Guide](docs/11-ollama-setup-and-ai-statecraft-guide.md)**.

---

## 🌟 Key Features

### 1. GIS Hexagonal Strategic Theater (48 Hex Sectors)

- Accurately mapped maritime and land sectors across Norway, the UK, West Germany, Denmark, Sweden, Finland, and the Soviet Kola Peninsula.
- Physical resource depots (fuel, munitions, production points) and a 5-turn uncontested sector capture engine.
- Construction catalog for airbases, naval bases, radar stations, refineries, and coastal batteries with GIS land/water polygon validation.

### 2. Complete Order of Battle

- **Soviet Northern Fleet & Kola Bastion**: _Kirov_ KUG surface groups, _Kiev_ aircraft cruisers, 11th Submarine Flotilla (Oscar/Victor/Alfa), Tu-22M3 Backfire missile aviation, MiG-25/31 interceptors, and the 61st Sputnik Naval Infantry.
- **Scandinavian Neutrality**: Royal Swedish Coastal Fleet, Gotland Island Brigade, Muskö Strike Flotilla, F 16 & F 21 Viggen wings; Finnish Coastal Fleet, Panssariprikaati (T-55M), and Lapland Jaeger Brigade.
- **NATO Northern Flank**: Royal Norwegian Navy fjord flotillas, UK Carrier Strike Group, US Amphibious Ready Group.

### 3. Autonomous AI Country Turns

- Each turn, non-player nations autonomously issue:
  - **Military Sorties & Fleet Movements**: Frontline patrols, ASW barriers, and automatic RTB when fuel < 40%.
  - **Foreign Policy**: Demarches, escalatory warnings, or neutrality reaffirmations.
  - **Covert Black Ops**: SIGINT wiretapping, COMINT overflights, or coastal hydrophone maintenance.
  - **R&D Doctrines**: Turn-by-turn progression across national defense doctrines.
- Inspect every decision in real time via the **`[ 📡 AI INTEL LOG ]`** debrief modal.

### 4. Fog of War & Sensor Network

- Hidden enemy units in unmonitored hexes.
- Radar stations (radius 2), coastal air patrols, and SOSUS acoustic hydrophone barriers.
- **Contact Fuzzing**: Perimeter radar returns render as unclassified `[?] TRACK` markers (radar return, acoustic contact, or visual sentry) concealing ship names and exact compositions until positively identified.

### 5. God Mode Debugger

- Toggle with the **`[ 👁️ GOD MODE: ON / OFF ]`** button or by pressing **`G`**.
- Immediately reveals all shrouded enemy sectors, hidden units, orders, and active mission routes (`👁️ Mission Route: → targetHexId`).

---

## 🧪 Testing & Verification

Run the comprehensive test and quality suite:

```bash
# Run format, linter, typecheck, unit tests, and integration tests
npm run check

# Run unit tests only
npm run test:unit

# Run API integration tests
npm run test:integration

# Auto-format codebase
npm run format
```

All **137 / 137 tests** pass with 100% compliance under strict TypeScript settings (`exactOptionalPropertyTypes: true`).

---

## 📚 Documentation Index

- **[Ollama Setup & AI Statecraft Guide](docs/11-ollama-setup-and-ai-statecraft-guide.md)**
- **[System Architecture & Data Model](docs/architecture/01-system-architecture-and-data-model.md)**
- **[Product Requirements Document (PRD)](docs/prd/01-product-requirements-document.md)**
- **[GitHub Stories Backlog & Delivery Roadmap](docs/roadmap/github-stories-backlog.md)**
- **[Modding Overview & Anchor Chain](docs/01-modding-overview.md)**
