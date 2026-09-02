# 09 - World data intake and map loading

The campaign uses external world data for geography and context, not as a
replacement for curated Sea Power mission design. Military values remain
scenario-owned estimates with explicit confidence and source notes.

## Intake

Run from `theater_campaign`:

```powershell
npm run ingest:world
npm run ingest:world -- --refresh
npm run ingest:world:all
```

The importer caches source snapshots under `data/world/raw/`, writes normalized
country geometry to `data/world/countries.json`, and records attribution in
`data/world/manifest.json`. Cached raw data is ignored by Git because source
redistribution terms must be reviewed independently.

The intake layers are `countries.json`, `regions.json`, `places.json`,
`ports.json`, and `airports.json`. Each can be imported independently with
`--source`; `ingest:world:all` imports the complete set.

## Map loading policy

Do not send the entire world overlay to the browser. The server should expose
three levels:

1. `world summary`: country names, IDs, and coarse geometry for the global map;
2. `zone detail`: regions, ports, bases, lanes, and country context for the
   active theater bounding box;
3. `mission detail`: selected forces, routes, contacts, and actionable sites.

Leaflet should render these as separate layers and request zone detail only
after the user selects a theater or crosses a zone boundary. Marker clustering,
viewport bounding-box queries, and simplified geometry should be used before
adding more detail. The normal campaign response must never include hidden
enemy truth merely because the map is zoomed in.

This keeps the world map useful while preserving the Sea Power principle:
world-scale context generates plausible missions; the active theater contains
the detail needed to make a mission fun.
