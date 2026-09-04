# GitHub Stories & Delivery Roadmap: Sea Power Theater Command

## Milestone Overview

```mermaid
flowchart LR
    subgraph Phase1["Phase 1: Foundation & Data Schema"]
        E1["Epic 1: Physical Depots & Persistence"]
        E2["Epic 2: 11-Phase Simultaneous Turn Engine"]
        E1 --> E2
    end

    subgraph Phase2["Phase 2: Hex Governance & AI"]
        E3["Epic 3: Hex Control Center & Governors"]
    end

    subgraph Phase3["Phase 3: Tactical Bridge"]
        E4["Epic 4: Mission Generator & Air Wings"]
        E5["Epic 5: Combat Telemetry & Reconciler"]
        E4 --> E5
    end

    subgraph Phase4["Phase 4: Multiplayer & Polish"]
        E6["Epic 6: Multiplayer WEGO & Tech Tree"]
    end

    Phase1 --> Phase2
    Phase2 --> Phase3
    Phase3 --> Phase4
```

---

## Epic 1: Worldwide Hex Data Schema & Persistent Logistics [COMPLETED - Issue #1]

- [x] **Story 1.1: Physical Resource Depots & 5-Turn Capture Engine** (#2)
  - Track physical fuel, munitions, and ore depots per hex.
  - Transfer ownership after 5 uncontested occupation turns; freeze extraction when contested.
- [x] **Story 1.2: Persistent Unit State (Component Damage & Ammo Bins)** (#3)
  - Persist discrete hull integrity, propulsion, radar, and weapon bins across battles.
  - Permanently remove destroyed units from the database.
- [x] **Story 1.3: Real Estate Registry & Land/Water Detection** (#4)
  - Enable construction of munitions plants, refineries, and airbases with automatic GIS polygon land/water validation.
- [x] **Story 1.4: Physical Trade Convoys & Interception Dynamics** (#5)
  - Spawn physical cargo flotillas along sea routes that can be interdicted by submarines and naval strike bombers.

---

## Epic 2: 11-Phase Simultaneous Turn Engine (WEGO) [COMPLETED - Issue #6]

- [x] **Story 2.1: Turn Phase Orchestrator** (#7)
  - Execute the 11-phase turn loop deterministically with structured turn ledger summaries.
- [x] **Story 2.2: National Military Market** (#8)
  - Provide a foreign surplus catalog to purchase Cold War vessels and aircraft with delivery turn delays.
- [x] **Story 2.3: Diplomatic Treaties & Ceasefire Expiration** (#9)
  - Track turn-bound diplomatic treaties (ceasefires, tributes, non-aggression pacts) and transition stances on expiry.
- [x] **Story 2.4: Regional Investment & Infrastructure Upgrades** (#10)
  - Allow direct treasury investment into hexes to boost production multipliers and revenue capacity.

---

## Epic 3: Hex Management & Autonomous Governors [COMPLETED - Issue #11]

- [x] **Story 3.1: Hex Quick-View & Interactive Control Modal** (#12)
  - Create unified React dashboard displaying overview, units, construction queue, and governor policies.
- [x] **Story 3.2: Formation Tactical Orders Palette (Move, Fortify, Refit, Split/Merge)** (#13)
  - Support direct tactical orders and transferring individual vessels between task forces.
- [x] **Story 3.3: Autonomous Governor AI & Policy Presets** (#14)
  - Implement 6 autonomous AI governor policies (Wealth, Industry, Extraction, Tech, Warmonger, Balanced) to manage hexes without micro-management.

---

## Epic 4: Tactical Bridge & Procedural Mission Generator [IN PROGRESS - Issue #15]

- [x] **Story 4.1: Airbase Strike Range Intersector** (#16)
  - Calculate operational radius from nearby friendly airbases to allocate air wings and CAP escorts to tactical missions.
- [x] **Story 4.2: Realistic Approach Vector & Ingress/Egress Zone Placement** (#17)
  - Generate Sea Power [Zone] objects along boundary vectors (SW, NE) and create safe egress zones for land-based planes.
- [x] **Story 4.3: Real Estate Static Asset Placement in Missions** (#18)
  - Place factories, fuel tanks, and radar masts from the hex as targetable 3D entities in generated Sea Power .ini missions.
- [ ] **Story 4.4: Deterministic Auto-Resolve Engine** (#19)
  - Provide Lanchester-based auto-resolution for minor skirmishes without launching Sea Power.

---

## Additional Major Features Delivered

- [x] **Story: Northern Flank Order of Battle (Murmansk Bastion, Sweden & Finland Forces)** (#29)
  - Full Kola Peninsula Soviet Northern Fleet strike groups, submarines, missile aviation, and motor rifle divisions.
  - Authentic Swedish Armed Forces (Muskö, Stockholm, Karlskrona, Gotland, Luleå) and Finnish Defense Forces (Helsinki, Lapland).
- [x] **Story: Autonomous Strategic AI Country Turns & National Doctrines** (#30)
  - Non-player nations autonomously pick orders, treaties, covert operations, and advance national R&D doctrines.
- [x] **Story: Fog of War Sensor Grid & Unclassified Contact Fuzzing** (#31)
  - Dynamic visibility matrix powered by radar stations, air patrols, SOSUS acoustic hydrophones, and recon overflights.
- [x] **Story: God Mode Strategic Debugger & Route Telemetry Overlay** (#32)
  - Debugger mode revealing all foreign nations' hidden units, orders, and active mission routes.
- [x] **Story: Black Ops Infiltration Engine (Assigned Units, Tactical Sea Power Mission Generator & War Escalation)** (#33)
  - Mandatory unit assignment (SSN/SSK flotillas, Commandos) requiring 1 AP and targeted hex selection.
  - Dual resolution: tactical Sea Power `.ini` mission generator with coastal ASW screens vs odds auto-resolve.
  - Full-scale war escalation trigger on nearshore compromise/destruction (DEFCON 1, bilateral war stance, treaty annulment, emergency telegrams).

---

## Epic 5: Combat Telemetry & State Reconciliation

- [ ] **Story 5.1: Real-Time UDP Telemetry Listener & Save File Parser** (#21)
  - Capture weapon release, damage, and unit kill events directly from Sea Power runtime stream or save debriefs.
- [ ] **Story 5.2: Battle Aftermath Reconciler (Munitions, XP & Morale)** (#22)
  - Deduct expended missiles/fuel, award crew veterancy XP, and adjust morale based on battle outcome.
- [ ] **Story 5.3: Time-Bound Mission Continuation & Mid-Battle Resume** (#23)
  - Preserve final coordinates from 30-minute engagements so subsequent sorties resume from the exact frontline.

---

## Epic 6: Multiplayer Foundations & Platform Polish

- [ ] **Story 6.1: Asynchronous Turn Queue & Simultaneous Resolution** (#25)
  - Support multi-player sessions where turns advance simultaneously once all participants submit orders.
- [ ] **Story 6.2: Anti-Cheat Hash Verification for Battle Reports** (#26)
  - Validate mission seed checksums and debrief logs against tampering in competitive multiplayer.
- [ ] **Story 6.3: Mission Directory & File-Drop Helper** (#27)
  - Allow direct export of generated .ini missions into Sea Power StreamingAssets directory with one click.
- [ ] **Story 6.4: Cold War Tech Tree & Research Progression** (#28)
  - Implement research tree with weapon and sensor modernization branches (Aegis, Harpoon, Towed Sonar).
