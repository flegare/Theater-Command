import { execSync } from "node:child_process";

const repo = "flegare/Theater-Command";

// Ensure labels exist
const labelsToEnsure = [
  { name: "epic", color: "3E4B9E", description: "High-level feature epic" },
  { name: "story", color: "0E8A16", description: "Implementation story" },
  {
    name: "foundation",
    color: "1D76DB",
    description: "Core data schema & persistence",
  },
  {
    name: "turn-engine",
    color: "5319E7",
    description: "11-phase turn resolution loop",
  },
  { name: "governor", color: "FBCA04", description: "Autonomous governor AI" },
  {
    name: "tactical-bridge",
    color: "D93F0B",
    description: "Sea Power mission generation",
  },
  {
    name: "telemetry",
    color: "006B75",
    description: "Combat telemetry & debrief ingestion",
  },
  {
    name: "multiplayer",
    color: "C2E0C6",
    description: "Multiplayer WEGO mechanics",
  },
];

console.log("Checking / creating labels on " + repo + "...");
for (const label of labelsToEnsure) {
  try {
    execSync(
      `gh label create "${label.name}" --repo ${repo} --color "${label.color}" --description "${label.description}" --force`,
      { stdio: "ignore" },
    );
    // Ignored if label already exists
  } catch {
    // Label already exists
  }
}

const issues = [
  // Epic 1
  {
    title: "Epic 1: Worldwide Hex Data Schema & Persistent Logistics",
    body: "Establish physical resource depots, 5-turn uncontested capture engine, and persistent unit component damage.\n\nRef: docs/prd/01-product-requirements-document.md",
    labels: ["epic", "foundation"],
  },
  {
    title: "Story 1.1: Physical Resource Depots & 5-Turn Capture Engine",
    body: "Hexes must track physical fuel and munitions depots. Occupation transfers ownership after 5 uncontested turns; contested status freezes extraction.",
    labels: ["story", "foundation"],
  },
  {
    title: "Story 1.2: Persistent Unit State (Component Damage & Ammo Bins)",
    body: "Persist discrete hull damage, propulsion health, and expended missile/torpedo bins across battles.",
    labels: ["story", "foundation"],
  },
  {
    title: "Story 1.3: Real Estate Registry & Land/Water Detection",
    body: "Allow construction of munitions plants, refineries, and airbases with automatic GIS polygon land/water validation.",
    labels: ["story", "foundation"],
  },
  {
    title: "Story 1.4: Physical Trade Convoys & Interception Dynamics",
    body: "Spawn physical cargo flotillas along sea routes that can be interdicted by submarines and naval strike bombers.",
    labels: ["story", "foundation"],
  },

  // Epic 2
  {
    title: "Epic 2: 11-Phase Simultaneous Turn Engine (WEGO)",
    body: "Implement the 11-phase deterministic turn execution pipeline for economic revenue, production, and movement.\n\nRef: docs/architecture/01-system-architecture-and-data-model.md",
    labels: ["epic", "turn-engine"],
  },
  {
    title: "Story 2.1: Turn Phase Orchestrator",
    body: "Execute the 11-phase turn loop deterministically with structured turn ledger summaries.",
    labels: ["story", "turn-engine"],
  },
  {
    title: "Story 2.2: National Military Market",
    body: "Provide a foreign surplus catalog to purchase Cold War vessels and aircraft with delivery turn delays.",
    labels: ["story", "turn-engine"],
  },
  {
    title: "Story 2.3: Diplomatic Treaties & Ceasefire Expiration",
    body: "Track turn-bound diplomatic treaties (ceasefires, tributes, non-aggression pacts) and transition stances on expiry.",
    labels: ["story", "turn-engine"],
  },
  {
    title: "Story 2.4: Regional Investment & Infrastructure Upgrades",
    body: "Allow direct treasury investment into hexes to boost production multipliers and revenue capacity.",
    labels: ["story", "turn-engine"],
  },

  // Epic 3
  {
    title: "Epic 3: Hex Management & Autonomous Governors",
    body: "Build the interactive Hex Control Center UI and autonomous governor AI with 6 doctrinal policies.",
    labels: ["epic", "governor"],
  },
  {
    title: "Story 3.1: Hex Quick-View & Interactive Control Modal",
    body: "Create unified React dashboard displaying overview, units, construction queue, and governor policies.",
    labels: ["story", "governor"],
  },
  {
    title:
      "Story 3.2: Formation Tactical Orders Palette (Move, Fortify, Refit, Split/Merge)",
    body: "Support direct tactical orders and transferring individual vessels between task forces.",
    labels: ["story", "governor"],
  },
  {
    title: "Story 3.3: Autonomous Governor AI & Policy Presets",
    body: "Implement 6 autonomous AI governor policies (Wealth, Industry, Extraction, Tech, Warmonger, Balanced) to manage hexes without micro-management.",
    labels: ["story", "governor"],
  },

  // Epic 4
  {
    title: "Epic 4: Tactical Bridge & Procedural Mission Generator",
    body: "Develop vector-based approach spawn zoning, airbase strike radius intersector, and static facility targeting.\n\nRef: docs/architecture/02-tactical-mission-generation-and-telemetry.md",
    labels: ["epic", "tactical-bridge"],
  },
  {
    title: "Story 4.1: Airbase Strike Range Intersector",
    body: "Calculate operational radius from nearby friendly airbases to allocate air wings and CAP escorts to tactical missions.",
    labels: ["story", "tactical-bridge"],
  },
  {
    title:
      "Story 4.2: Realistic Approach Vector & Ingress/Egress Zone Placement",
    body: "Generate Sea Power [Zone] objects along boundary vectors (SW, NE) and create safe egress zones for land-based planes.",
    labels: ["story", "tactical-bridge"],
  },
  {
    title: "Story 4.3: Real Estate Static Asset Placement in Missions",
    body: "Place factories, fuel tanks, and radar masts from the hex as targetable 3D entities in generated Sea Power .ini missions.",
    labels: ["story", "tactical-bridge"],
  },
  {
    title: "Story 4.4: Deterministic Auto-Resolve Engine",
    body: "Provide Lanchester-based auto-resolution for minor skirmishes without launching Sea Power.",
    labels: ["story", "tactical-bridge"],
  },

  // Epic 5
  {
    title: "Epic 5: Combat Telemetry & State Reconciliation",
    body: "Ingest post-battle results via UDP telemetry and save logs, updating persistent damage, ammo, and morale.",
    labels: ["epic", "telemetry"],
  },
  {
    title: "Story 5.1: Real-Time UDP Telemetry Listener & Save File Parser",
    body: "Capture weapon release, damage, and unit kill events directly from Sea Power runtime stream or save debriefs.",
    labels: ["story", "telemetry"],
  },
  {
    title: "Story 5.2: Battle Aftermath Reconciler (Munitions, XP & Morale)",
    body: "Deduct expended missiles/fuel, award crew veterancy XP, and adjust morale based on battle outcome.",
    labels: ["story", "telemetry"],
  },
  {
    title: "Story 5.3: Time-Bound Mission Continuation & Mid-Battle Resume",
    body: "Preserve final coordinates from 30-minute engagements so subsequent sorties resume from the exact frontline.",
    labels: ["story", "telemetry"],
  },

  // Epic 6
  {
    title: "Epic 6: Multiplayer Foundations & Platform Polish",
    body: "Implement asynchronous turn queues (WEGO), cryptographic anti-cheat validation, and Cold War tech trees.",
    labels: ["epic", "multiplayer"],
  },
  {
    title: "Story 6.1: Asynchronous Turn Queue & Simultaneous Resolution",
    body: "Support multi-player sessions where turns advance simultaneously once all participants submit orders.",
    labels: ["story", "multiplayer"],
  },
  {
    title: "Story 6.2: Anti-Cheat Hash Verification for Battle Reports",
    body: "Validate mission seed checksums and debrief logs against tampering in competitive multiplayer.",
    labels: ["story", "multiplayer"],
  },
  {
    title: "Story 6.3: Mission Directory & File-Drop Helper",
    body: "Allow direct export of generated .ini missions into Sea Power StreamingAssets directory with one click.",
    labels: ["story", "multiplayer"],
  },
  {
    title: "Story 6.4: Cold War Tech Tree & Research Progression",
    body: "Implement research tree with weapon and sensor modernization branches (Aegis, Harpoon, Towed Sonar).",
    labels: ["story", "multiplayer"],
  },
];

console.log(`Creating ${issues.length} GitHub issues on ${repo}...`);
for (const issue of issues) {
  try {
    const labelFlags = issue.labels.map((l) => `--label "${l}"`).join(" ");
    const cmd = `gh issue create --repo ${repo} --title "${issue.title}" --body "${issue.body}" ${labelFlags}`;
    const out = execSync(cmd, { encoding: "utf8" });
    console.log(`✓ ${issue.title} -> ${out.trim()}`);
  } catch (err) {
    console.error(`✗ Error creating ${issue.title}:`, err.message);
  }
}
