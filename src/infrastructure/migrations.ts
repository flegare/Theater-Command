import { createHash } from "node:crypto";
import type { CampaignDatabase } from "./database.js";

type Migration = { id: string; sql: string };

const migrations: Migration[] = [
  {
    id: "001_campaign_setup",
    sql: `
      CREATE TABLE campaigns (
        id TEXT PRIMARY KEY,
        scenario_family_id TEXT NOT NULL,
        scenario_variant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        seed TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        tech_mode TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        campaign_time TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE campaign_players (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        country_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (campaign_id, country_id)
      );
      CREATE TABLE coalitions (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        side TEXT NOT NULL,
        PRIMARY KEY (campaign_id, id)
      );
      CREATE TABLE countries (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        coalition_id TEXT NOT NULL,
        objectives_json TEXT NOT NULL,
        PRIMARY KEY (campaign_id, id),
        FOREIGN KEY (campaign_id, coalition_id) REFERENCES coalitions(campaign_id, id)
      );
      CREATE TABLE country_relations (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        country_id TEXT NOT NULL,
        related_country_id TEXT NOT NULL,
        stance TEXT NOT NULL,
        PRIMARY KEY (campaign_id, country_id, related_country_id),
        FOREIGN KEY (campaign_id, country_id) REFERENCES countries(campaign_id, id),
        FOREIGN KEY (campaign_id, related_country_id) REFERENCES countries(campaign_id, id)
      );
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        campaign_time TEXT NOT NULL,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX events_campaign_time_idx ON events(campaign_id, campaign_time, id);
      CREATE TABLE local_sessions (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        player_country_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        FOREIGN KEY (campaign_id, player_country_id) REFERENCES campaign_players(campaign_id, country_id)
      );
      CREATE INDEX local_sessions_campaign_idx ON local_sessions(campaign_id);
    `,
  },
  {
    id: "002_campaign_state_ledger",
    sql: `
      CREATE TABLE campaign_economy (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
        funds INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE world_entities (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        side TEXT NOT NULL,
        tag TEXT NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        quantity INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX world_entities_campaign_idx ON world_entities(campaign_id);
      CREATE INDEX world_entities_campaign_tag_idx ON world_entities(campaign_id, tag);
      CREATE INDEX world_entities_campaign_status_idx ON world_entities(campaign_id, status);

      CREATE TABLE world_entity_effects (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
        effect_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX world_entity_effects_campaign_idx ON world_entity_effects(campaign_id);
      CREATE INDEX world_entity_effects_entity_idx ON world_entity_effects(entity_id);

      CREATE TABLE force_inventory (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        side TEXT NOT NULL,
        country_id TEXT NOT NULL,
        platform_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',
        quantity INTEGER NOT NULL DEFAULT 1,
        replacement_cost INTEGER NOT NULL DEFAULT 0,
        repair_cost INTEGER NOT NULL DEFAULT 0,
        repair_hours INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX force_inventory_campaign_idx ON force_inventory(campaign_id);
      CREATE INDEX force_inventory_campaign_status_idx ON force_inventory(campaign_id, status);
    `,
  },
  {
    id: "003_hexagonal_strategic_system",
    sql: `
      ALTER TABLE campaign_economy ADD COLUMN production_points INTEGER NOT NULL DEFAULT 50;
      ALTER TABLE campaign_economy ADD COLUMN fuel_stockpile INTEGER NOT NULL DEFAULT 200;

      CREATE TABLE campaign_hex_cells (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        hex_id TEXT NOT NULL,
        side TEXT NOT NULL,
        country_id TEXT NOT NULL,
        contested INTEGER NOT NULL DEFAULT 0,
        damaged_base INTEGER NOT NULL DEFAULT 0,
        improvements_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (campaign_id, hex_id)
      );
      CREATE INDEX campaign_hex_cells_campaign_idx ON campaign_hex_cells(campaign_id);
      CREATE INDEX campaign_hex_cells_side_idx ON campaign_hex_cells(campaign_id, side);

      CREATE TABLE campaign_formations (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        unit_type TEXT NOT NULL,
        side TEXT NOT NULL,
        country_id TEXT NOT NULL,
        hex_id TEXT NOT NULL,
        strength INTEGER NOT NULL DEFAULT 100,
        action_points INTEGER NOT NULL DEFAULT 1,
        max_action_points INTEGER NOT NULL DEFAULT 1,
        embarked_on_id TEXT,
        status TEXT NOT NULL DEFAULT 'ready',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX campaign_formations_campaign_idx ON campaign_formations(campaign_id);
      CREATE INDEX campaign_formations_hex_idx ON campaign_formations(campaign_id, hex_id);
      CREATE INDEX campaign_formations_side_idx ON campaign_formations(campaign_id, side);
    `,
  },
  {
    id: "004_persistent_depots_and_turn_engine",
    sql: `
      ALTER TABLE campaign_hex_cells ADD COLUMN capture_turns_counter INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE campaign_hex_cells ADD COLUMN occupying_side TEXT;
      ALTER TABLE campaign_hex_cells ADD COLUMN occupying_country_id TEXT;
      ALTER TABLE campaign_hex_cells ADD COLUMN depot_fuel INTEGER NOT NULL DEFAULT 100;
      ALTER TABLE campaign_hex_cells ADD COLUMN depot_missiles INTEGER NOT NULL DEFAULT 20;
      ALTER TABLE campaign_hex_cells ADD COLUMN depot_torpedoes INTEGER NOT NULL DEFAULT 10;
      ALTER TABLE campaign_hex_cells ADD COLUMN depot_shells INTEGER NOT NULL DEFAULT 200;
      ALTER TABLE campaign_hex_cells ADD COLUMN depot_titanium INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE campaign_hex_cells ADD COLUMN depot_iron INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE campaign_hex_cells ADD COLUMN depot_uranium INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE campaign_hex_cells ADD COLUMN governor_policy TEXT NOT NULL DEFAULT 'balanced';
      ALTER TABLE campaign_hex_cells ADD COLUMN governor_automated INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE campaign_hex_cells ADD COLUMN investment_tier INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE military_market_orders (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        unit_name TEXT NOT NULL,
        unit_type TEXT NOT NULL,
        country_id TEXT NOT NULL,
        target_hex_id TEXT NOT NULL,
        cost_funds INTEGER NOT NULL,
        delivery_turn INTEGER NOT NULL,
        turns_remaining INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX military_market_campaign_idx ON military_market_orders(campaign_id);

      CREATE TABLE diplomatic_treaties (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        treaty_type TEXT NOT NULL,
        party_a_country_id TEXT NOT NULL,
        party_b_country_id TEXT NOT NULL,
        duration_turns INTEGER NOT NULL,
        turns_remaining INTEGER NOT NULL,
        terms_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX diplomatic_treaties_campaign_idx ON diplomatic_treaties(campaign_id);
    `,
  },
  {
    id: "005_covert_ops_and_tension_ledger",
    sql: `
      CREATE TABLE campaign_tensions (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
        tension_index INTEGER NOT NULL DEFAULT 20,
        defcon_level INTEGER NOT NULL DEFAULT 5,
        peace_turns_counter INTEGER NOT NULL DEFAULT 0,
        last_incident_summary TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE covert_operations (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        source_country_id TEXT NOT NULL,
        target_country_id TEXT NOT NULL,
        target_hex_id TEXT NOT NULL,
        op_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        funds_cost INTEGER NOT NULL,
        success_chance REAL NOT NULL,
        attribution_risk REAL NOT NULL,
        detected INTEGER NOT NULL DEFAULT 0,
        result_summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX covert_ops_campaign_idx ON covert_operations(campaign_id);
      CREATE INDEX covert_ops_campaign_status_idx ON covert_operations(campaign_id, status);

      CREATE TABLE clandestine_flashpoints (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        flashpoint_type TEXT NOT NULL,
        sector_hex_id TEXT NOT NULL,
        title TEXT NOT NULL,
        narrative TEXT NOT NULL,
        involved_countries_json TEXT NOT NULL DEFAULT '[]',
        turns_active INTEGER NOT NULL DEFAULT 3,
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX clandestine_flashpoints_campaign_idx ON clandestine_flashpoints(campaign_id);
    `,
  },
  {
    id: "006_diplomatic_reactions_and_transit_rights",
    sql: `
      CREATE TABLE diplomatic_cables (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        sender_country_id TEXT NOT NULL,
        recipient_country_id TEXT NOT NULL,
        classification TEXT NOT NULL DEFAULT 'TOP SECRET',
        header TEXT NOT NULL,
        content TEXT NOT NULL,
        stance_change TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX diplomatic_cables_campaign_idx ON diplomatic_cables(campaign_id);
    `,
  },
  {
    id: "007_diplomatic_inbox_and_world_news",
    sql: `
      ALTER TABLE diplomatic_cables ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE world_news_dispatches (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        agency TEXT NOT NULL,
        headline TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX world_news_campaign_idx ON world_news_dispatches(campaign_id);
    `,
  },
  {
    id: "008_country_relations_score_and_casus_belli",
    sql: `
      ALTER TABLE country_relations ADD COLUMN relation_score INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE country_relations ADD COLUMN casus_belli_json TEXT;
    `,
  },
  {
    id: "009_diplomatic_relation_events",
    sql: `
      CREATE TABLE country_relation_events (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        country_id TEXT NOT NULL,
        related_country_id TEXT NOT NULL,
        delta_score INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX country_relation_events_idx ON country_relation_events(campaign_id, country_id, related_country_id);
    `,
  },
  {
    id: "010_campaign_ai_turn_logs",
    sql: `
      CREATE TABLE campaign_ai_turn_logs (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        turn_number INTEGER NOT NULL,
        country_id TEXT NOT NULL,
        country_name TEXT NOT NULL,
        stance TEXT NOT NULL,
        orders_summary TEXT NOT NULL,
        actions_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX campaign_ai_turn_logs_idx ON campaign_ai_turn_logs(campaign_id, turn_number, country_id);
    `,
  },
  {
    id: "011_covert_ops_assigned_unit_and_mission",
    sql: `
      ALTER TABLE covert_operations ADD COLUMN assigned_formation_id TEXT;
      ALTER TABLE covert_operations ADD COLUMN assigned_formation_name TEXT;
      ALTER TABLE covert_operations ADD COLUMN resolution_mode TEXT NOT NULL DEFAULT 'auto_resolve';
      ALTER TABLE covert_operations ADD COLUMN tactical_mission_ini TEXT;
      ALTER TABLE covert_operations ADD COLUMN sortie_outcome TEXT DEFAULT 'pending';
      ALTER TABLE covert_operations ADD COLUMN war_declared INTEGER NOT NULL DEFAULT 0;
    `,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function migrateDatabase(database: CampaignDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = database.prepare(
    "SELECT id, checksum FROM schema_migrations WHERE id = ?",
  );
  const insert = database.prepare(
    "INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)",
  );

  for (const migration of migrations) {
    const expectedChecksum = checksum(migration.sql);
    const existing = applied.get(migration.id) as
      { id: string; checksum: string } | undefined;
    if (existing) {
      if (existing.checksum !== expectedChecksum) {
        throw new Error(`Migration checksum mismatch for ${migration.id}.`);
      }
      continue;
    }
    database.transaction(() => {
      database.exec(migration.sql);
      insert.run(migration.id, expectedChecksum, Date.now());
    })();
  }
}
