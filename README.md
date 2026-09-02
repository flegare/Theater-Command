# Sea Power Theater Campaign

This is the external strategic campaign application for Sea Power. It is deliberately separate from `../admiral_dashboard`: it can be developed, tested, and run without the game or its tactical telemetry bridge.

Run `npm install`, then `npm run dev` for local development or `npm run build && npm start` for the production build at `http://127.0.0.1:3100`.

## Mission Outcome Model

Generated lane missions now include dual-side briefing and objective documentation in the exported mission INI so scenarios can be side-flipped with clearer intent for both coalitions.

- BLUFOR mission intent: preserve sea-lane throughput, classify contacts correctly, and protect critical regional infrastructure.
- REDFOR mission intent: gather high-confidence reconnaissance on defended assets and optionally disrupt strategic logistics.

## Theater Campaign Integration Notes

Mission outcomes are designed to feed theater-level progression and should be consumed by campaign logic in follow-up work:

- BLUFOR success can increase regional revenue, preserve production, and accelerate defensive reinforcement or new capability availability.
- REDFOR success can degrade local production, reduce revenue and readiness, and in severe escalations support follow-on invasion pressure.

The mission generator currently documents end-state rules in INI briefing/objective text and comments. Hard mission-completion triggers remain intentionally lightweight and should be finalized in campaign orchestration logic.

## Refinery Scenario Support

Refinery and air-defense templates can now emit side-specific land-unit formations and a seeded objective profile. When the generator finds a refinery-style layout, it can choose between refinery disruption, air-defense reconnaissance, shipping interdiction, and industrial target identification while skipping options that would be too far away to execute credibly.

## Modular Mission Rules

Mission generation and INI rendering now support a modular rule orchestrator so theater-specific logic can be enabled or disabled by context instead of remaining hardcoded.

- Mission modules live under [src/domain/mission-mods](src/domain/mission-mods).
- Context configuration is passed as `generationConfig` on lane mission APIs.
- The orchestrator resolves active modules from area profile, module allow/deny lists, and campaign state.

Current modules:

- `fisherman_intel_reports`: enables fisherman-based submarine and surface contact intel triggers for coastal/littoral missions.
- `refinery_state_continuity`: keeps refinery objective/trigger logic active unless campaign state marks refinery infrastructure as destroyed.

Example request payload fragment:

```json
{
  "routeId": "bergen-scapa-shipping-lane",
  "seed": "1983-03f84a54",
  "generationConfig": {
    "areaProfile": "coastal",
    "enabledModules": ["fisherman_intel_reports"],
    "disabledModules": [],
    "campaignState": {
      "destroyedInfrastructureTags": ["mongstad-refinery"]
    }
  }
}
```

This allows follow-up missions to reflect persistent campaign outcomes (for example, suppressing refinery continuity behavior after refinery destruction).

## Persistent World Ledger

The campaign now uses a generalized persistence ledger in SQLite for world entities, force inventory, and daily economic effects.

Tracked entity classes:

- Infrastructure and fixed world objects (for example, ports, refinery sites, HAWK sites).
- Force inventory for BLUFOR and OPFOR platforms (purchase, loss, repair lifecycle).
- Optional mission-spawned persistent objects via API registration.

Lifecycle statuses supported:

- `active`, `damaged`, `repairing`, `destroyed`, `sunk`.

Key API endpoints:

- `GET /api/v1/campaigns/current/state`: full snapshot (economy, entities, inventory, destroyed tags).
- `POST /api/v1/campaigns/current/state/entities`: register a persistent world entity with optional daily economic effect.
- `PATCH /api/v1/campaigns/current/state/entities/:entityId`: update lifecycle status and quantity.
- `POST /api/v1/campaigns/current/state/forces/:inventoryId/actions`: apply `purchase`, `loss`, or `repair` to force inventory.
- `POST /api/v1/campaigns/current/state/advance-day`: advance campaign day and apply active daily effects.

Mission generation now auto-merges destroyed infrastructure tags from the ledger into generation config, so persistence rules apply even when clients do not manually pass those tags.
