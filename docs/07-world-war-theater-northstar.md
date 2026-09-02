# 07 - World War Theater North Star

**Revision 2 - campaign foundation first (2026-08-10)**

This is the authoritative product and architecture plan. The prescriptive, lower-tier-model execution backlog is maintained in [`08-world-war-theater-implementation-backlog.md`](08-world-war-theater-implementation-backlog.md). When older notes conflict with this revision, this document and backlog 08 win.

This document defines the long-term direction for turning the current Admiral AI dashboard and Sea Power bridge into an external dynamic campaign layer inspired by DCS Liberation: a persistent theater simulator that generates Sea Power missions, imports or resolves outcomes, and advances a NATO vs Warsaw Pact war over time.

## North Star

Build an external "government and theater command" layer above Sea Power.

The player acts as one country's national leadership, not just a ship captain and not an omniscient coalition commander. The system tracks countries, ports, factories, shipping lanes, task forces, unit experience, ammunition, damage, production, logistics, intelligence, and theater objectives. Allies retain their own command authority and share only politically and technically available information. AI governments and admirals, optionally backed by local Ollama models, compete for resources and propose or execute operations. After the standalone strategic campaign is mature, Sea Power becomes an optional tactical battle resolver: when an engagement matters, the system generates a mission `.ini`, the player loads it, plays it, then the result updates the strategic war state.

If the player skips a battle, an auto-resolver estimates the outcome using force balance, readiness, experience, geography, sensors, weather, weapons, doctrine, support, and logistics.

## Design Principles

- External-first: the persistent campaign state lives outside Sea Power in our app/database.
- National perspective first: the player governs one country. Coalition command, omniscience, and direct control of allied forces are not implied.
- Fog of war is a data boundary: ground truth and each country's knowledge are stored separately. Normal APIs never serialize hidden enemy truth.
- Sea Power-native output: generated battles are normal Sea Power mission `.ini` files placed under `StreamingAssets\user\...`.
- Deterministic core, AI-assisted choices: the simulation rules must be auditable; Ollama proposes plans and narratives, but hard state changes come from deterministic campaign services.
- Doctrine-bounded AI: AI commanders choose from a library of plausible Cold War plans, doctrine packages, and operation templates before improvising. Free-form AI strategy is advisory only.
- Local and optional AI: the campaign must run on a single Windows PC with Ollama, but Ollama being slow, busy, or offline must never corrupt or block the campaign.
- One deployable application: start as a modular monolith with one SQLite database and one web UI. Split services only after measured operational need.
- Strategic time, tactical pause: global theater time advances continuously or turn-by-turn, but freezes when the player launches a generated Sea Power mission.
- Geography matters: ports, straits, sea lanes, bases, chokepoints, range, detection, and weather drive operations.
- Logistics are gameplay: ships, aircraft, missiles, fuel, troops, repairs, spare parts, and factory output must move through vulnerable transport networks.
- Persistence has teeth: damaged ships, lost aircraft, ammo expenditure, crew experience, port disruption, country control, and supply shortages carry forward.
- Playable slices: the strategic layer suggests concrete Sea Power missions with clear objectives instead of simulating everything abstractly.
- Integration is earned: no new Sea Power bridge or mission-generation work begins until campaign state, time, orders, perspectives, intelligence, and deterministic resolution pass their foundation gates.

## Player Experience

### Campaign Start

The first screen is a campaign setup workflow, not the current tactical debugger.

1. Select a scenario family.
2. Select an alternate start date offered by that scenario, such as 1975, 1979, 1983, 1985, or 1989. A date is a curated scenario variant, not only a technology slider; borders, alliances, inventories, tensions, deployments, and objectives can differ.
3. Select one playable country. The UI shows its government objectives, alliance obligations, command scope, economy, starting forces, known threats, and expected difficulty.
4. Select campaign options: deterministic seed, difficulty, time scale, AI policy, Ollama model, and optional historical versus accelerated technology.
5. Create the campaign. The selected country becomes the immutable player perspective for that save.

The initial vertical slice provides one scenario family, `Northern Flank`, with a small set of date variants and at least Norway, United Kingdom, United States, and Soviet Union as technically valid perspectives. Content depth can initially be strongest for Norway and the Soviet Union, but the data model must not hardcode BLUFOR/OPFOR or USN/WP assumptions.

### Strategic Command Center

After setup, the player enters a work-focused theater command interface:

- theater map with owned forces, uncertain allied summaries, intelligence contacts, installations, sea lanes, and political boundaries
- campaign clock with pause, `+1 hour`, `+6 hours`, and `+24 hours`; time advancement stops on required decisions
- national overview for political capital, production, research, logistics, readiness, and current objectives
- force browser and task-force composer for selecting units, creating groups, plotting routes, assigning posture, and issuing missions
- operations board containing planned operations, reconnaissance requests, AI staff proposals, detected opportunities, and unresolved battles
- intelligence center showing reports, source, age, confidence, uncertainty, competing assessments, and collection requests
- allied liaison view showing only information actually shared by allies
- event timeline and decision inbox

The map must never display an enemy campaign unit simply because it exists in the database. It displays an intelligence track generated from one or more reports.

### Command Authority

- The player controls units owned by the selected country and any units explicitly placed under national operational control.
- Allied units normally appear as aggregated formations, approximate operating areas, intent summaries, or liaison reports.
- Exact allied composition, location, and orders require a sharing agreement, compatible command network, attached force, or joint operation.
- The player can request allied support. The ally's deterministic policy and AI staff may accept, reject, delay, restrict, or condition the request.
- Enemy and neutral units are never directly commandable.

### God Mode

God Mode is a development tool, not a campaign ability.

- It is available only when the server starts with `GOD_MODE_ENABLED=1`.
- The UI shows an unmistakable persistent `GOD MODE - GROUND TRUTH` banner while active.
- It can switch among player perspective, another country's perspective, and ground truth without modifying campaign state.
- It exposes actual units, hidden orders, observations, fused tracks, confidence changes, AI proposals, deterministic rule traces, random seed use, and event provenance.
- Normal campaign endpoints must remain perspective-filtered. Ground truth uses separate `/api/dev/*` endpoints guarded server-side; hiding a button is not authorization.
- Automated tests must prove that normal endpoints do not leak enemy IDs, exact positions, routes, inventories, or secret orders.

## Fog of War and Intelligence

### Three Separate Layers

1. **Ground truth:** actual units, routes, readiness, stockpiles, installations, political state, and orders.
2. **Observations:** immutable reports from sensors, reconnaissance, allies, agents, open sources, and events.
3. **Belief state:** country-specific fused tracks and assessments derived from observations.

No UI projection or AI prompt may join directly from player-visible entities to ground-truth enemy units. Fusion code may reference truth only inside simulation adapters that generate observations.

### Intelligence Track

An intelligence track stores:

- public `track_id`, never the hidden unit ID
- observing country and compartment
- domain and estimated classification
- last known position and time
- uncertainty geometry or radius
- estimated course and speed ranges
- estimated strength and composition ranges
- confidence from `0.0` to `1.0`
- source families, reliability, corroboration, and deception flags
- first seen, last seen, stale-after, and expiry times
- candidate identities and probabilities
- history of assessments and superseded reports

Confidence and precision decay with time. A stale track remains at its last assessed location with growing uncertainty; it does not silently follow the hidden unit. Negative search results can lower confidence or eliminate parts of the uncertainty area but cannot prove absence everywhere.

### Period-Appropriate Collection

The 1975-1990 setting supports these collection families:

- visual reports from ships, aircraft, ports, fishing vessels, and civilian traffic
- radar, sonar, ESM/ELINT, radio direction finding, and communications intelligence
- maritime patrol, airborne early warning, submarine patrol, reconnaissance aircraft, and surface pickets
- fixed acoustic barriers and national/allied surveillance networks represented as regional capabilities
- agents, diplomatic reporting, defectors, port observers, covert teams, and compromised communications
- imagery intelligence over fixed sites and selected operating areas
- allied intelligence sharing with delay, redaction, and political conditions
- open-source indicators such as mobilization, port departures, exercises, and commercial shipping disruption

Satellite technology improves revisit rate, processing delay, covered area, and source reliability; it never unlocks a live omniscient map. The US had near-real-time electro-optical imagery from KH-11 beginning in December 1976, but tasking, orbital access, weather, interpretation, and dissemination still matter. Soviet EORSAT/RORSAT systems provide intermittent ocean reconnaissance with different EMCON and identification limitations, especially useful near Soviet ocean approaches. These distinctions become scenario capabilities, not literal classified-system simulators.

Historical grounding: the NRO records the first KH-11 launch on 19 December 1976 and its shift from film-return delays to near-real-time transmission. Declassified US assessments describe Soviet EORSAT as able to locate emitters while RORSAT could search a limited area regardless of EMCON but could not reliably identify contacts; the same assessments emphasize orbital coverage, survivability, and dissemination limits.

### Reconnaissance as Gameplay

- `area_search`: search a polygon for surface or air activity
- `barrier_patrol`: detect crossings of a line or chokepoint
- `shadow_contact`: maintain a track while managing counter-detection risk
- `port_watch`: estimate units, loading, readiness, and departure timing at a fixed site
- `signals_collection`: improve emitter classification and order-of-battle knowledge
- `submarine_patrol`: search an area with high uncertainty and delayed reports
- `agent_operation`: obtain political, industrial, or force information with compromise risk
- `imagery_tasking`: observe a bounded area during available collection windows
- `allied_request`: ask another country for a report or collection task

Every collection order has cost, latency, coverage, weather and terrain limits, counter-detection risk, false-positive/false-negative behavior, and an output observation schema. Reconnaissance is therefore both a prerequisite for many strikes and an operation that can itself create Sea Power missions later.

### Deception and Counterintelligence

- EMCON reduces emitter-based detection but does not erase radar, visual, acoustic, or agent exposure.
- Feints, decoys, false radio traffic, and concealed departures can create false or ambiguous observations.
- Counterintelligence reduces agent reliability, identifies leaks, and may feed deception.
- AI and auto-resolve consume the same country belief state as the player. They cannot inspect ground truth to choose an action and then invent an intelligence justification afterward.

## Campaign Loop

1. The player creates a campaign from a scenario/date variant and selects one country.
2. The command center projects only that country's forces, allied reports, and intelligence belief state.
3. The player allocates resources, composes task forces, plots routes, and issues operations or reconnaissance.
4. Theater time advances in deterministic one-hour ticks; movement, collection, intelligence fusion/decay, logistics, production, readiness, and politics update in fixed order.
5. AI governments and commanders choose doctrine branches and propose or execute only validated operations using their own belief state.
6. New reports, allied requests, political choices, and detected contacts create decision points that can stop time advancement.
7. The player reviews known information, accepts/edits/rejects staff proposals, and commits national forces.
8. Encounters resolve through the explainable strategic resolver during the standalone foundation.
9. Losses, damage, ammunition, experience, cargo, intelligence consequences, and political/economic effects persist and generate an auditable event history.
10. After Sea Power Integration Gate G, an eligible encounter may instead export a standalone tactical mission and freeze campaign time.
11. A confirmed manual or telemetry-assisted debrief applies through the same idempotent result path; skipped battles continue to use the strategic resolver.

## Core Domain Model

### Era

The default campaign era is the late Cold War: 1975 through 1990.

This creates a natural tech progression:

- early campaign: legacy gun/missile cruisers, older destroyers, early nuclear submarines, first-generation shipboard missiles, early interceptors, limited datalink and weaker point defense
- mid campaign: mature Harpoon/Exocet/Styx-era missile warfare, better towed arrays, improved SAMs, better ESM/EW, Tomcat/Phoenix and Backfire-style strike threats
- late campaign: Aegis/Ticonderoga-era fleet air defense, improved Harpoon, Tomahawk, ADCAP torpedoes, improved Soviet SAM/ASM systems, better airborne warning, stronger ECM, and "what if" late-1980s escalations

The system should let a campaign start in any year between 1975 and 1990. Starting year gates what units and weapons are available, what can be researched, and how expensive it is to accelerate future technology.

### Theater

- World map divided into named regions, sea zones, chokepoints, countries, coastlines, ports, and bases.
- Each zone has ownership, contested status, local weather, sea state, detection modifiers, traffic density, and strategic value.
- Countries have allegiance, stability, industrial output, political will, mobilization level, surrender threshold, and victory conditions.

### Economy

- Factories produce points/resources over time.
- Shipyards repair and build vessels.
- Airbases generate sorties and maintain aircraft.
- Ports move supplies and enable invasion or reinforcement.
- Resource types should start simple: `industrial_points`, `naval_points`, `air_points`, `logistics_points`, `intel_points`, `ammunition_points`.
- Political alignment affects production access, basing rights, transit rights, sanctions, and covert operation costs.
- Research spending unlocks improved units, weapons, sensors, logistics capabilities, training doctrine, and repair methods.
- Training spending converts money/time into better crew quality and doctrine readiness.

### Alliances and Political Influence

Countries are not only map ownership. Each country should track:

- ruling faction
- alliance alignment: NATO, Warsaw Pact, non-aligned, proxy, occupied, contested
- public support
- elite loyalty
- military loyalty
- intelligence penetration
- unrest
- sanctions pressure
- basing rights
- port access
- overflight/transit rights
- coup vulnerability

Political influence is a campaign resource. It can be spent on diplomacy, propaganda, arms aid, training missions, sanctions, destabilization, and covert action. A country can shift alignment gradually, become contested, or flip suddenly if a government collapses.

Covert operations should be first-class missions in the theater layer:

- infiltrate advisors or special forces
- support insurgents
- capture or extract a president
- sabotage port infrastructure
- destroy radar or SAM sites
- mine a harbor
- steal technology
- trigger political scandal
- protect a friendly government

Covert operations do not always generate Sea Power missions. Some resolve strategically. Others can generate naval missions: insert special forces by submarine, escort a covert landing ship, intercept a coup support convoy, evacuate leadership, or strike a coastal command site.

Political operations need risk:

- failure can reveal involvement
- exposure damages alliance cohesion
- civilian casualties reduce legitimacy
- failed coups can harden enemy alignment
- successful covert action may bypass a costly invasion

### Research and Development

R&D converts economic output into technology unlocks. It should be era-gated and faction-specific, but allow plausible "what if" acceleration.

Research tracks:

- Hulls and shipbuilding
- Naval aviation
- Anti-ship missiles
- Surface-to-air missiles and fleet air defense
- Torpedoes and ASW
- Sensors, sonar, radar, and towed arrays
- Electronic warfare and decoys
- Land-based air defense and coastal missiles
- Amphibious/logistics lift
- Damage control and repair doctrine
- Training/doctrine
- Intelligence and covert operations

Research unlocks should map to actual Sea Power vanilla assets wherever possible. If a capability exists in real life but not in vanilla assets, it is tracked as a campaign modifier until a modded unit/weapon is created.

### Training and Doctrine

Units have crew skill and institutional doctrine separate from hardware.

Crew skill levels should align with Sea Power mission values:

- Green
- Trained
- Veteran
- Elite

Campaign fields:

- `crew_skill`
- `experience_points`
- `fatigue`
- `morale`
- `readiness`
- `doctrine_profile`
- `last_training_date`
- `combat_history`

Training investment can:

- improve new unit starting skill
- raise existing units over time
- reduce auto-resolve losses
- improve reaction time and detection interpretation
- improve damage control
- improve missile salvo doctrine
- improve ASW prosecution
- improve carrier air wing sortie generation

Training costs readiness in the short term. A task force in training is less available for operations, but becomes more capable later.

### Repair and Maintenance

Damage must be tied to logistics.

Repair levels:

- Light: can be repaired at sea or at any friendly port with tenders/supply.
- Moderate: requires friendly port with repair capacity.
- Heavy: requires friendly dry dock or shipyard.
- Crippled: requires tow/salvage and dry dock; high chance of being written off.
- Sunk: removed from force pool.

Dry docks and shipyards are strategic assets. They have:

- capacity
- max ship size/class
- repair throughput
- vulnerability to strike/sabotage
- spare parts stockpile
- workforce/industrial level

Major capital ship damage should become a theater-level event. A damaged carrier or cruiser cannot simply spend points anywhere; it needs route security to reach a suitable dry dock.

### Logistics

- Supplies move along shipping lanes between production centers, ports, and fleets.
- Transport capacity is represented by merchant convoys, replenishment ships, landing ships, and airlift.
- Shipping lanes can be interdicted, mined, blockaded, or escorted.
- Invasion requires troop lift, naval cover, air cover, and port/beach access.
- Research and training resources must physically translate into deployable capability: new missiles require ammunition production, new ships require shipyards, and better training requires available time at sea or in exercises.

### Forces

- Force entities:
  - `TaskForce`
  - `SurfaceGroup`
  - `Submarine`
  - `AirWing`
  - `Convoy`
  - `AmphibiousGroup`
  - `LandGarrison`
  - `PortDefense`
- Units track type, nation, class, variant, readiness, location, speed, fuel/endurance, ammunition, damage, crew skill, experience, morale, assigned mission, and repair status.
- Unit IDs must map to Sea Power `Type=` and `VariantReference=` values where playable.
- Unit availability is constrained by year, research, alliance access, production, and transfer rules.
- Captured or export equipment can exist, but should carry maintenance and training penalties unless the nation has support infrastructure.

### Timeline

- Campaign time is authoritative.
- Task forces have routes with waypoints, ETAs, speed profiles, emissions posture, and mission intent.
- Engagement opportunities are generated from spatial overlap, detection, orders, and theater rules.
- When a tactical mission is launched, campaign time freezes until the battle is resolved.

### AI Commanders

- Each nation or coalition can have AI personas:
  - political leadership
  - theater commander
  - naval commander
  - logistics commander
  - intelligence staff
- Ollama produces:
  - strategic proposals
  - mission recommendations
  - force allocation arguments
  - narrative briefings/debriefings
  - risk summaries
- Deterministic services validate:
  - available forces
  - legal routes
  - logistics feasibility
  - budget constraints
  - mission generation compatibility
  - political permission and escalation risk
  - tech/research availability
  - crew readiness and repair state

## Vanilla Asset Inventory Baseline

This section is derived from local vanilla `.ini` definitions under:

- `Sea Power_Data\StreamingAssets\original\vessels`
- `Sea Power_Data\StreamingAssets\original\aircraft`
- `Sea Power_Data\StreamingAssets\original\ammunition`
- `Sea Power_Data\StreamingAssets\original\land_units`
- `Sea Power_Data\StreamingAssets\original\systems`

Approximate vanilla vessel definition coverage by prefix:

- `wp`: 68 Warsaw Pact/Soviet vessels
- `usn`: 65 US Navy vessels
- `civ`: 41 civilian/logistics/fishing/merchant vessels
- `plan`: 16 PLA Navy vessels
- `ins`: 8 Israeli vessels
- `ir`: 8 Iranian vessels
- `jmsdf`: 8 Japanese vessels
- `knm`: 6 Norwegian vessels
- `fgs`: 4 West German vessels
- smaller sets for Spain, Royal Navy, Royal Australian Navy, Canadian Navy, Pakistan, Libya, Portugal, North Vietnam, France

Representative vanilla naval units:

- USN carriers and capital ships: `usn_cv_america_79`, `usn_cv_forrestal_75`, `usn_cv_kitty_hawk`, `usn_cvn_enterprise`, `usn_cvn_nimitz`, `usn_bb_iowa`
- USN cruisers/destroyers/frigates: `usn_cg_ticonderoga`, `usn_cgn_virginia`, `usn_cgn_california`, `usn_cgn_long_beach_73`, `usn_cgn_long_beach_83`, `usn_cg_belknap`, `usn_cg_leahy`, `usn_dd_spruance`, `usn_dd_spruance_abl`, `usn_ddg_kidd`, `usn_ddg_adams_late`, `usn_ff_knox`, `usn_ffg_oliver_hazard_perry`
- USN submarines: `usn_ssn_los_angeles`, `usn_ssn_los_angeles_76`, `usn_ssn_sturgeon`, `usn_ssn_permit`, `usn_ssn_skipjack`, `usn_ssbn_lafayette`, `usn_ssbn_james_madison`, `usn_ssbn_franklin`
- USN logistics/amphibious: `usn_aoe_sacramento`, `usn_ae_kilauea`, `usn_ao_t2`, `usn_lha_tarawa`, `usn_lpd_austin`, `usn_lst_newport`, `usn_takr_algol`
- Warsaw Pact/Soviet major combatants: `wp_cv_orel`, `wp_pkr_moskva`, `wp_bpk_kara`, `wp_bpk_kresta2`, `wp_bpk_udaloy`, `wp_bpk_kashin`, `wp_em_sovremenny`, `wp_kr_sverdlov`
- Warsaw Pact/Soviet missile craft and patrol: `wp_mrk_nanuchka`, `wp_ptg_komar`, `wp_ptg_osa1`, `wp_ptg_osa2`, `wp_ptg_tarantul`, `wp_pt_shershen`, `wp_pt_stenka`, `wp_pt_turya`
- Warsaw Pact/Soviet amphibious/logistics: `wp_bdk_alligator`, `wp_bdk_ropucha`, `wp_bdk_ivan_rogov`, `wp_ms_roro_b`, `wp_ms_andizhan_armed`
- NATO allies: `fgs_ddg_lutjens`, `knm_ffg_oslo`, `ran_ffg_adelaide_shorthull`, `ran_ddg_perth`, `jmsdf_ddh_haruna`, `jmsdf_ddg_tachikaze`, `es_ffg_baleares`
- Submarine export/allied sets: `fgs_ss_type_205`, `fgs_ss_type_206`, `knm_ss_kobben`, `jmsdf_ss_yushio`, `ran_ss_oberon`, `rcn_ss_oberon`, `fr_ss_agosta`, `fr_ss_daphne`

Representative vanilla aircraft:

- USN: `usn_f-14a`, `usn_f-4j`, `usn_fa-18a`, `usn_a-6e`, `usn_a-7e`, `usn_e-2c`, `usn_ea-6b`, `usn_s-3a`, `usn_p-3c`, `usn_sh-2f`, `usn_sh-3h`
- USAF/USMC: `usaf_f-15a`, `usaf_f-15c`, `usaf_f-4d`, `usaf_f-4e`, `usaf_b-52d`, `usaf_b-52g`, `usaf_e-3a`, `usmc_av-8a`, `usmc_ah-1t`
- Warsaw Pact: `wp_mig-21`, `wp_mig-23a`, `wp_mig-23mld`, `wp_mig-25p`, `wp_mig-25pd`, `wp_mig-27`, `wp_su-15`, `wp_su-24a`, `wp_su-24m`, `wp_tu-16`, `wp_tu-16k`, `wp_tu-22m2`, `wp_tu-95rt`, `wp_tu-142m`, `wp_yak-38`, `wp_ka-25`, `wp_ka-27`, `wp_il-38`
- Allies/others: French Mirage/F1/Super Frelon, Japanese F-1/F-4EJ/HSS-2/PS-1, Chinese H-6/J-7/Q-5/Z-8, Australian F-111C/A-4G, Iranian F-14/F-4/AH-1J

Representative vanilla land/strategic targets:

- Ports: Norfolk, Mayport, Halifax, Clyde, Portsmouth, Plymouth, Belfast, Liverpool, Dover, Felixstowe, Reykjavik/Keflavik-related Iceland bases, Severomorsk, Kandalaksha, Persian Gulf ports, Indian Ocean ports
- Airbases: NATO small/very small airbases, Icelandic airbases, Warsaw Pact airbases, PVO airbases
- SAM/radar: NATO Hawk/Nike/Rapier-style sites, Warsaw Pact SA-2/3/4/5/6/8/10/11/13 sites, radar stations, coastal missile launchers
- Economic targets: oil terminals, fuel tanks, refineries, warehouses, industry buildings, bridges, ammo depots

Representative vanilla ammunition/weapon families:

- US anti-ship/strike: `usn_rgm-84a`, `usn_agm-84a`, `usn_agm-84c`, `usn_agm-84d`, `usn_rgm-109b`, `usn_rgm-109c`
- US air-to-air: `usn_aim-54a`, `usn_aim-7d/e/e2/e4/f/m`, `usn_aim-9b/c/d/g/h/l/m`, USAF AIM-9 variants
- US land air defense: `usa_mim-14`, `usa_mim-23`
- US ASW/torpedoes: `usn_mk37`, `usn_mk44`, `usn_mk46`, `usn_mk46_mod5`, `usn_mk48`, `usn_mk48_mod4`, `usn_mk48_mod4_adcap`, `usn_moss`, `usn_mk54_dc`
- European/Allied anti-ship: `fr_mm-38`, `fr_am-39`, `fr_sm-39`, `is_gabriel_2`, `is_gabriel_3`, `knm_penguin_mk2`, `it_otomat_mk1`, `it_seakiller_2`, `jasdf_asm-1`
- Warsaw Pact/Chinese anti-ship: `plan_sy-1`, `plan_hy-1`, `plan_hy-2`, `plan_hy-4`, `plan_yj-8`, `pla_hy-3`, `pla_yj-1`, `pla_yj-6`, plus Soviet fire-control references for SS-N-3/12 and ship systems
- Bombs/rockets/EW: Mk-82/83/84, Rockeye/CBU, Shrike/Standard ARM/HARM-era weapons, gun pods, rockets, ECM pods, decoys

The tech tree should be generated from this catalog first, then expanded with real-world or "what if" nodes when vanilla lacks a desired capability.

## Draft Tech Tree

### NATO Naval Track

- 1975 baseline: Gearing/FRAM, Knox, Garcia, Brooke, Belknap/Leahy, early Adams/Coontz, Forrestal/Kitty Hawk, Permit/Sturgeon, early P-3, F-4J, A-7E, A-6E
- Mid unlocks: Oliver Hazard Perry, Spruance, Kidd, Nimitz/Enterprise improvements, Los Angeles SSN, better P-3C/S-3A ASW, E-2C/EW integration
- Late unlocks: Ticonderoga, Spruance ABL, Iowa reactivation, Tomahawk, improved Harpoon, improved Mk48/ADCAP, F/A-18A, AIM-7M/AIM-9M, stronger carrier air wing integration
- What-if: accelerated Aegis deployment, wider Tomahawk refits, allied Harpoon modernization, improved convoy defense kits, earlier cooperative engagement-like doctrine as an abstract modifier

### Warsaw Pact Naval Track

- 1975 baseline: Sverdlov, Kashin, Kresta/Kara-era combatants, Komar/Osa missile boats, older amphibious ships, Tu-16, MiG-21/23, Ka-25, legacy diesel-electric submarine force
- Mid unlocks: Nanuchka/Tarantul missile craft, improved Grisha, Moskva/Kiev-style aviation cruiser capabilities, Tu-95RT targeting, Tu-142 ASW, Ka-27, improved coastal missiles
- Late unlocks: Sovremenny, Udaloy, Kinzhal/Uragan/S-300 naval air defense equivalents where represented, Tu-22M2 strike, Su-24M, improved submarine sensors/torpedoes, stronger electronic warfare
- What-if: earlier carrier aviation maturity, improved long-range targeting network, accelerated missile doctrine, more reliable datalink, larger amphibious lift

### Allied/Regional Tracks

- NATO allies: West German Lutjens/Type 205/206, Norwegian Oslo/Hauk/Kobben, British/RAN/JMSDF destroyers/frigates/subs, Spanish Baleares
- Regional powers: Israel Gabriel/Saar, Iran Alvand/Combattante/F-14/F-4, China PLAN Jianghu/Luda/HY/YJ families, Japan JMSDF ASW and air defense
- These should usually unlock through alliance influence, arms transfers, basing rights, export licenses, or political alignment rather than pure domestic research.

### Non-Hardware Research

- Training doctrine: improves crew skill growth and auto-resolve performance.
- Damage control: reduces chance heavy damage becomes crippled/sunk.
- Logistics automation: increases convoy throughput and replenishment speed.
- Intelligence fusion: improves detection, mission generation accuracy, and covert operation odds.
- Electronic warfare: improves decoy effectiveness, missile defense, and strike survivability.
- Political warfare: improves influence operations and reduces exposure risk.

## Cold War Plan and Tactic Library

The theater AI should not invent a brand-new grand strategy every turn. It should choose from a curated library of plausible Cold War war plans, doctrine packages, and mission templates. Ollama can explain, rank, and locally adapt these plans, but deterministic rules should decide whether the plan is legal and feasible.

This gives admirals a more realistic role:

- assess the current theater state
- select an established plan or branch
- allocate available forces
- adapt timing, routes, and targets
- request resources
- execute and report outcomes

### Plan Object

Each strategic plan should be stored as structured data:

- `plan_id`
- `name`
- `coalition`
- `era_window`
- `theaters`
- `strategic_goal`
- `required_conditions`
- `trigger_conditions`
- `force_requirements`
- `political_requirements`
- `logistics_requirements`
- `phases`
- `operation_templates`
- `risks`
- `success_metrics`
- `failure_branches`
- `mission_generation_rules`
- `auto_resolve_modifiers`

### Operation Template Object

Each operation template should be smaller and reusable:

- `operation_id`
- `mission_family`
- `objective`
- `preferred_force_package`
- `minimum_force_package`
- `target_selector`
- `route_selector`
- `emcon_doctrine`
- `engagement_rules`
- `retreat_rules`
- `Sea Power mission template`
- `campaign_effects`

### NATO Plausible Plan Families

- **GIUK Barrier Defense**
  - Goal: contain Soviet submarines and surface raiders before they enter the Atlantic.
  - Assets: SOSUS/intelligence abstraction, P-3C, S-3A, frigates, SSNs, Iceland/Norway basing.
  - Missions: ASW barrier patrol, submarine prosecution, convoy escort, airbase defense, recon.

- **Atlantic Sea-Lane Protection**
  - Goal: keep reinforcement convoys flowing from North America to Europe.
  - Assets: carrier groups, convoy escorts, replenishment ships, MPA, NATO ports.
  - Missions: convoy escort, shipping lane clearance, intercept raiders, protect tankers, rescue damaged merchants.

- **Norwegian Sea Forward Defense**
  - Goal: pressure Soviet Northern Fleet, defend Norway, threaten Soviet bastions.
  - Assets: carrier battle groups, SSNs, NATO surface groups, Norwegian fast attack craft, land-based air.
  - Missions: carrier task force defense, strike Soviet surface groups, coastal interdiction, protect amphibious reinforcement.

- **Maritime Strike Against Northern Fleet**
  - Goal: degrade Soviet naval power near Kola/Barents.
  - Assets: carriers, Tomahawk-capable units if unlocked, SSNs, long-range air.
  - Missions: port strike, SAM/radar suppression, submarine ambush, missile raid.

- **Baltic Containment**
  - Goal: bottle Pact forces in the Baltic and protect Denmark/Germany.
  - Assets: West German/Danish/NATO fast attack craft, mines, submarines, coastal air.
  - Missions: blockade, mine warfare abstraction, fast attack craft intercept, convoy interdiction.

- **Persian Gulf Stability / Tanker War**
  - Goal: secure oil flow and prevent regional escalation.
  - Assets: escorts, minesweepers, air patrol, regional basing.
  - Missions: tanker escort, mine clearance abstraction, coastal strike, intercept missile boats.

### Warsaw Pact Plausible Plan Families

- **Northern Fleet Breakout**
  - Goal: push submarines and surface strike groups through GIUK into Atlantic sea lanes.
  - Assets: SSNs/SSKs/SSGNs, Backfire/Tu-16 strike, surface missile groups, AGI/intelligence vessels.
  - Missions: breakout through chokepoint, ASW suppression, decoy convoy, strike patrol aircraft bases.

- **Carrier Saturation Strike**
  - Goal: locate and overwhelm NATO carrier battle groups.
  - Assets: Tu-16/Tu-22M, Tu-95RT, submarines, missile cruisers, long-range anti-ship missiles.
  - Missions: recon sweep, coordinated missile raid, submarine shadowing, surface group lure.

- **Atlantic Convoy Interdiction**
  - Goal: disrupt reinforcement shipping before it reaches Europe.
  - Assets: submarines, long-range maritime aircraft, surface raiders, armed merchants/decoys.
  - Missions: submarine ambush, merchant raider attack, convoy disruption, port approach mining abstraction.

- **Norway / Iceland Pressure**
  - Goal: degrade NATO northern basing and open the Atlantic.
  - Assets: amphibious lift, airborne/covert forces, surface escorts, coastal strikes.
  - Missions: port seizure, airbase strike, covert sabotage, amphibious screen, political destabilization.

- **Bastion Defense**
  - Goal: protect SSBN operating areas and Northern Fleet bases.
  - Assets: layered submarines, ASW ships, land-based air, coastal missiles, SAM/radar networks.
  - Missions: ASW patrol, intercept NATO SSNs, defend port, shoot down recon aircraft, coastal missile trap.

- **Baltic Surge**
  - Goal: secure exits, pressure Denmark/Germany, and support land war.
  - Assets: missile boats, amphibious craft, mines, land-based air, coastal missile batteries.
  - Missions: fast attack swarm, amphibious escort, port raid, convoy interdiction, SAM umbrella defense.

### Non-Aligned and Proxy Plan Families

- **Regime Preservation**
  - Goal: keep a friendly government alive.
  - Missions: evacuation, arms convoy escort, port defense, counter-coup operation.

- **Regime Change / Coup Support**
  - Goal: flip a country without full invasion.
  - Missions: covert landing, president capture/extraction, sabotage communications, arms shipment.

- **Arms Transfer Corridor**
  - Goal: move export weapons or advisors to a proxy.
  - Missions: blockade run, convoy escort, port surveillance, intercept smuggling.

- **Resource Denial**
  - Goal: disrupt oil, minerals, or strategic ports.
  - Missions: tanker interdiction, refinery strike, harbor mining abstraction, sabotage.

### Admiral AI Usage

Admiral prompts should be constrained to this workflow:

1. Summarize theater state.
2. Pick one plan family and one branch.
3. Justify why the pre-authored plan applies.
4. Select operation templates from the library.
5. Assign available forces.
6. Request missing resources or political permissions.
7. Produce limited tactical variations: route, timing, EMCON, force package, abort criteria.

The model should not be allowed to directly create a new strategic objective unless it explicitly marks it as a staff proposal for player approval.

### Example Plan Branch

```json
{
  "plan_id": "wp_northern_fleet_breakout",
  "branch": "submarine_first",
  "coalition": "Warsaw Pact",
  "goal": "Open a submarine corridor through the GIUK gap",
  "phase": 2,
  "operations": [
    "strike_keflavik_patrol_air",
    "submarine_barrier_probe",
    "agi_decoy_route",
    "surface_group_feint_norwegian_sea"
  ],
  "success_metrics": [
    "at_least_3_submarines_enter_atlantic",
    "nato_mpa_sortie_rate_reduced",
    "convoy_lane_risk_above_60"
  ]
}
```

## Sea Power Integration

### Mission Generation

Generate standard Sea Power mission `.ini` files with:

- `[Environment]` from geolocated engagement zone and campaign date/time.
- `[Mission]` taskforce counts and player/enemy assignment.
- `[TaskforceNVesselM]` from campaign units, including `Type`, `VariantReference`, `CrewSkill`, `RelativePositionInNM`, `Heading`, `Telegraph`, and optional waypoints.
- Objectives and triggers for success/failure.
- Briefing text generated from campaign state.
- Optional use of Task Force Mode features later, but initial implementation should generate standalone missions for reliability.

### Geographic Conversion

The campaign stores real lat/lon. Mission files use Sea Power offsets:

- `MapCenterLatitude`
- `MapCenterLongitude`
- `RelativePositionInNM = lon_delta_minutes, 0, lat_delta_minutes`

The existing docs note that Sea Power uses minutes of longitude directly for X rather than applying cosine latitude correction.

### Result Import

Supported result sources are implemented in risk order:

1. Manual debrief form validated against the exported battle manifest.
2. Auto-resolve when the battle is skipped.
3. Telemetry-assisted draft debrief, reviewed and confirmed by the player.
4. Sea Power save/debrief import only if a stable, versioned format is proven later.

The first reliable manual result contract supports:

- unit survived/destroyed
- damage level
- ammunition remaining or estimated expenditure
- aircraft losses
- objective completion
- mission winner
- commander notes

## Auto-Resolve Requirements

Auto-resolve must be explainable, not just random.

Inputs:

- force ratio by domain: surface, sub, air, missile, land, logistics
- weapon range and magazine depth
- sensor advantage and emissions posture
- crew skill and unit experience
- damage/readiness
- surprise and intelligence quality
- local weather/sea state/day-night
- mission type and objective
- nearby support
- retreat routes

Outputs:

- objective success/failure
- losses and damage
- ammunition expenditure
- experience gain
- detection/intelligence changes
- theater effects such as port disruption, convoy loss, blockade strength, country stability

## Mission Types

Initial mission catalog:

- Convoy escort
- Shipping lane interdiction
- Port reconnaissance
- Port strike
- Carrier task force attack
- Surface action group intercept
- ASW barrier patrol
- Submarine ambush
- Amphibious landing screen
- Blockade enforcement
- Breakout through chokepoint
- Evacuation or reinforcement run
- Missile raid defense

Each mission type needs:

- strategic trigger condition
- eligible force types
- Sea Power mission template rules
- success criteria
- auto-resolve model
- campaign effects

## System Architecture

### Deployment Decision

Build a new sibling application named `theater_campaign`. Do not turn the current 797-line tactical `app.js` and in-memory `server.js` into the campaign application. Keep `admiral_dashboard` running as a legacy telemetry and bridge laboratory until the Sea Power integration gate.

Use a modular monolith:

```text
theater_campaign/
  package.json
  .env.example
  src/
    server/             Express bootstrap, routes, session/perspective middleware
    domain/             Pure deterministic rules and types
    application/        Commands, queries, transactions, campaign tick orchestration
    infrastructure/     SQLite, Ollama, clock, random source, file adapters
    modules/
      campaigns/
      scenarios/
      countries/
      forces/
      movement/
      intelligence/
      diplomacy/
      economy/
      logistics/
      research/
      doctrine/
      ai-staff/
      resolution/
      devtools/
    seeds/              Versioned scenario and catalog source data
  migrations/           Ordered SQL migrations
  web/
    src/                React application
  test/
    fixtures/
    integration/
    contract/
    e2e/
```

Modules have explicit ownership but share one process and one transaction boundary. HTTP routes call application commands/queries; they do not contain domain logic. UI code never opens SQLite or calls Ollama directly.

### Prescribed Stack

- Runtime: current Node.js LTS, with the exact major recorded in `.nvmrc` and `engines`.
- Language: TypeScript with `strict: true`; no new campaign JavaScript files.
- Server: Express 5, bound to `127.0.0.1` by default.
- Database: SQLite through `better-sqlite3`, WAL mode, foreign keys enabled, ordered SQL migrations, one database file per campaign during the prototype.
- Validation and contracts: Zod schemas shared by API handlers, scenario import, Ollama output, and tests.
- Web: React, Vite, TypeScript, React Router, TanStack Query, and Leaflet.
- State: server-authoritative. Use component state for UI details and TanStack Query for server state; do not add a global client state library until demonstrated necessary.
- Geography: GeoJSON plus a maintained geodesic library for movement and distance; no ad hoc latitude/longitude arithmetic in campaign rules.
- Tests: Vitest for domain/unit tests, Supertest for HTTP integration, and Playwright for user workflows and perspective-leak regression.
- Formatting/lint: ESLint, Prettier, and `tsc --noEmit` in the required check command.
- AI: Ollama HTTP API at `OLLAMA_URL`, default `http://127.0.0.1:11434`; no cloud dependency.
- Packaging: npm scripts on Windows PowerShell; Docker is neither required nor the primary path.

Required local commands:

```powershell
npm install
npm run dev
npm run check
npm test
npm run test:e2e
```

`npm run dev` starts server and web development processes. Production-like local mode uses `npm run build` followed by `npm start`, with Express serving the built web assets.

### Domain Modules and Ownership

- `campaigns`: lifecycle, campaign clock, deterministic seed, pause reasons, victory state, save metadata.
- `scenarios`: immutable scenario templates, alternate-date variants, playable-country definitions, initial world seeding.
- `countries`: player identity, government, national objectives, command authority, resources, political state.
- `forces`: units, ownership, attachments, task forces, readiness, damage, ammunition, training, orders.
- `movement`: routes, waypoints, geodesic travel, ETAs, zone crossing, fuel/endurance checks.
- `intelligence`: observations, fusion, tracks, confidence decay, uncertainty, collection orders, sharing, deception.
- `diplomacy`: alliances, access rights, liaison, support requests, political influence, escalation, covert actions.
- `economy`: production, budget allocation, purchase/build queues, factories and industrial damage.
- `logistics`: stocks, convoys, supply routes, port throughput, replenishment, invasion lift.
- `research`: historical availability, research projects, plausible acceleration, capability unlocks.
- `doctrine`: plans, branches, operation templates, deterministic applicability and scoring.
- `ai-staff`: bounded Ollama jobs, structured proposals, deterministic fallback, validation, audit.
- `resolution`: deterministic strategic operation resolution and later tactical-battle import/export.
- `devtools`: God Mode projections, traces, scenario validation, seed replay, and diagnostics.

### Persistence Rules

The database is the authority. Every state-changing command runs in one transaction and appends an event record containing campaign time, actor, command type, affected aggregate IDs, deterministic seed cursor, and a redacted summary.

Minimum schema groups:

- identity: `campaigns`, `campaign_players`, `countries`, `coalitions`, `country_relations`, `command_authority`
- geography: `regions`, `zones`, `ports`, `bases`, `installations`, `sea_lanes`
- force truth: `units`, `task_forces`, `task_force_members`, `routes`, `route_waypoints`, `orders`, `stocks`
- intelligence: `observations`, `intel_tracks`, `intel_track_candidates`, `intel_sources`, `collection_orders`, `intel_sharing_rules`
- politics/economy: `country_politics`, `facilities`, `production_orders`, `research_projects`, `training_programs`, `repair_orders`, `covert_operations`
- plans/AI: `doctrine_plans`, `plan_branches`, `operation_templates`, `ai_jobs`, `ai_proposals`, `proposal_validation_results`
- simulation: `events`, `decision_points`, `operations`, `operation_participants`, `resolution_reports`
- later integration: `tactical_battles`, `mission_exports`, `battle_imports`

Hidden foreign keys such as an enemy unit ID may exist inside server-side observation provenance, but normal perspective projections remove them. Player-facing tracks use unrelated IDs.

### Time and Determinism

- The base simulation quantum is one campaign hour.
- UI advances of 6 or 24 hours execute repeated one-hour ticks inside bounded transactions and stop at the first mandatory decision point.
- Movement, production, readiness, training, repairs, intelligence decay, collection, AI scheduling, and operation detection run in a documented fixed order.
- All randomness comes from a seeded campaign random service; domain code must not call `Math.random()` or wall-clock time.
- Replaying the same scenario, seed, and command sequence must produce the same state hash when Ollama proposals are disabled or replayed from stored proposals.
- Ollama output never affects state until converted into a validated command accepted through the normal command path.

### API and Perspective Boundary

Use explicit versioned routes:

- `/api/v1/setup/*`: scenarios, date variants, playable countries, campaign creation
- `/api/v1/campaign/*`: player-safe summary, clock, objectives, events, decisions
- `/api/v1/map/*`: perspective-projected map layers and tracks
- `/api/v1/forces/*`: authorized forces, task-force composition, routes, orders
- `/api/v1/intelligence/*`: reports, tracks, collection requests, sharing
- `/api/v1/operations/*`: plans, proposals, operation orders, results
- `/api/v1/economy/*`, `/logistics/*`, `/research/*`, `/diplomacy/*`
- `/api/v1/ai/*`: model discovery, queue status, proposal request and review
- `/api/dev/*`: server-guarded ground truth and traces; absent or `404` when God Mode is disabled

Every campaign query requires a local player session identifying campaign and country. Perspective projection occurs in application query handlers, before serialization. UI filtering is only a second defensive layer.

### Ollama Operating Contract

- Ollama is optional at boot and probed without delaying server readiness.
- The selected model is stored per campaign but can be changed.
- At most one generation job runs concurrently by default so the game PC is not saturated.
- Strategic AI runs at planned decision intervals and significant events, never every simulation tick.
- Prompt input is a bounded, perspective-filtered JSON staff brief plus a doctrine candidate list.
- Output must match a versioned Zod schema containing proposal, plan/branch IDs, requested units by visible/authorized ID, assumptions, risks, abort criteria, and explanation.
- The adapter uses a configurable timeout, cancellation, one repair attempt for invalid JSON, and deterministic fallback scoring.
- AI jobs and proposals are persisted. A failed or cancelled job leaves campaign state unchanged.
- The AI cannot call application endpoints, write files, issue UDP commands, or mutate the database.
- OPFOR models receive only that country's belief state. God Mode data is never placed in prompts.

### Current Project Reuse

Keep and reuse knowledge, not the current screen structure:

- retain `admiral_dashboard` tests and bridge safety fixes as the tactical laboratory
- reuse the existing Ollama discovery behavior as a reference, then replace the free-form direct-order flow with structured proposal jobs
- reuse Leaflet experience and GIS conversion documentation, but build new strategic map components
- import vanilla unit and weapon data from `Sea Power_Data\StreamingAssets\original` into a versioned catalog; never modify `original`
- retain the bridge read-only and command execution disabled by default
- do not share live tactical in-memory state with campaign state

### Current Interface Disposition

| Current dashboard element          | Campaign disposition                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| BLUFOR/OPFOR perspective buttons   | Replaced by the campaign's fixed player country. Other perspectives exist only in server-enabled God Mode.   |
| Tactical GIS/radar map             | Remains in the telemetry lab. The campaign gets a new strategic Leaflet map driven by perspective-safe APIs. |
| Direct BLUFOR/OPFOR Ollama buttons | Replaced by queued national staff proposals using doctrine candidates and structured validation.             |
| Issued UDP command log             | Not carried into the foundation. Campaign orders mutate only campaign state through application commands.    |
| AAR event table                    | Replaced by campaign event timeline, operation history, and versioned strategic/tactical resolution reports. |
| Telemetry tree and raw packet view | Moved to God Mode diagnostics after telemetry integration Gate H.                                            |
| Mock distance/EMCON toolbar        | Replaced by deterministic scenario fixtures, replay CLI, and God Mode developer controls.                    |
| Game/Ollama status badges          | Split into campaign health and optional integration/AI status; neither blocks ordinary campaign play.        |

### Local PC Operating Envelope

- Target Windows 10/11 x64 with current Node.js LTS and npm.
- Default campaign server: `http://127.0.0.1:3100`, leaving the legacy dashboard on port 3000.
- Ollama remains a separate local process on `127.0.0.1:11434`; a 7B/8B-class instruct model is the expected baseline, but no specific model name is hardcoded.
- Default AI generation concurrency is 1, queue capacity 8, timeout 120 seconds, response limit 64 KiB, and one repair attempt. No AI HTTP call holds a SQLite transaction open.
- The vertical-slice target is under 4 seconds for a 24-hour advance on the host PC with AI scheduling disabled or queued, and under 750 MB application working set excluding Ollama and browser. Benchmarks record evidence and can revise these budgets deliberately.
- Core tests and the production-like local build do not require internet access. Map tests use bundled geography/background assets, and Ollama tests use a local fake server.
- Closing Ollama, Sea Power, the browser, or the legacy dashboard must not corrupt an active campaign. The campaign database is committed hourly and backed up before migration.

## MVP Scope

The first useful release is a standalone campaign vertical slice. Sea Power does not need to be running and no mission files are generated.

Scenario: `Northern Flank`, initially bounded to the GIUK Gap, Norwegian Sea, Iceland, northern United Kingdom, and Kola approaches.

Required vertical-slice loop:

1. Create a campaign from an alternate-date scenario variant and choose a country.
2. See only that country's starting knowledge.
3. Compose or select a national task force, assign a route and operation, and inspect ETA/readiness/logistics feasibility.
4. Request reconnaissance against an area or suspected contact.
5. Advance time; forces move, reports arrive, tracks decay or improve, production progresses, and decision points interrupt advancement.
6. Review a doctrine-bounded staff proposal generated by Ollama or deterministic fallback.
7. Accept, edit, or reject the proposal through normal validated orders.
8. Resolve one strategic encounter using an explainable deterministic resolver.
9. Persist losses, damage, ammunition, experience, intelligence consequences, and political/economic effects.
10. Reload the campaign and reproduce the same state and event history.
11. Enable God Mode in development and compare both national perspectives with ground truth and rule traces.

The slice includes at least:

- two coalitions and four countries
- one scenario family with three alternate dates
- eight ports/bases, six sea zones, and three sea lanes
- four national task forces, one convoy, reconnaissance aircraft abstraction, and fixed surveillance capabilities
- own-force exact display, allied high-level display, and enemy intelligence tracks only
- surface movement, convoy escort/interdiction, area reconnaissance, and port-watch operations
- economy tick, stocks, basic repair/readiness, and one research choice
- two NATO and two Warsaw Pact doctrine branches
- deterministic AI fallback plus optional Ollama proposal
- deterministic strategic resolver; no Sea Power mission generation

## Development Task List

Backlog 08 contains the executable task packets. The phase order is binding:

### Foundation A - Product Skeleton

Create the new application, checks, database migration runner, scenario contracts, local session/perspective boundary, and setup workflow.

**Gate A:** a campaign can be created for a selected country/date, persisted, reloaded, and queried without any opponent truth leaking through normal APIs.

### Foundation B - Deterministic Theater

Implement campaign ticks, geography, movement, task forces, routes, orders, event history, state hashes, and replay fixtures.

**Gate B:** identical seed and command sequence produce identical hourly states; task forces move correctly and time stops on decision points.

### Foundation C - Intelligence and Fog of War

Implement observations, tracks, confidence/uncertainty decay, reconnaissance, allied sharing, perspective projections, and God Mode comparison.

**Gate C:** perspective-leak tests pass for all player endpoints, stale tracks do not follow hidden units, and God Mode can explain every visible track from its source observations.

### Foundation D - Playable Strategic Loop

Implement operations, doctrine branches, deterministic proposal fallback, encounter detection, strategic resolution, persistence effects, and the command-center workflows.

**Gate D:** the complete standalone vertical-slice loop is playable and passes E2E tests with Ollama offline.

### Foundation E - Local AI Staff

Implement Ollama discovery, serialized jobs, bounded prompts, structured response validation, proposal review, failure handling, and perspective isolation.

**Gate E:** a small local model can produce a valid proposal without direct mutation; timeout, malformed output, cancellation, and offline cases all preserve campaign state.

### Foundation F - Economy, Logistics, Politics, and R&D

Deepen production, transport, repair, training, research, alliance access, political influence, and covert operations while retaining deterministic traces.

**Gate F:** each subsystem creates meaningful operational constraints and is exercised by at least one scenario decision and one automated E2E path.

### Integration G - Sea Power Export and Resolution

Only after Gates A-F: inventory catalog finalization, mission templates, `.ini` generation, mission manifest, manual debrief, tactical pause, and outcome application.

**Gate G:** a generated standalone mission loads in Sea Power, its manifest round-trips through manual debrief, and campaign time/state resume exactly once.

### Integration H - Read-Only Tactical Telemetry

Only after Gate G: map campaign battle participants to telemetry, capture outcomes with strict performance budgets, and retain manual debrief fallback.

**Gate H:** telemetry can be disabled with no campaign loss, cannot issue commands by default, and causes no measurable game slowdown at the agreed sampling profile.

### Expansion I - Additional Theaters

Add Baltic, Mediterranean, Persian Gulf, and Pacific scenario packs, non-aligned nations, proxies, richer covert actions, alliance friction, escalation, and plausible late-1980s alternatives.

## Settled Decisions and Deferred Questions

Settled for the foundation:

- The player commands one country.
- Allies are partially visible and independently governed.
- Fog of war is implemented before economy depth and before Sea Power integration.
- The initial theater is the Northern Flank vertical slice, not the world.
- The campaign is deterministic without Ollama; personality affects proposals and priorities, not rule legality.
- God Mode is server-gated and development-only.
- Generated Sea Power content starts as standalone missions; Task Force Mode integration is deferred.
- Technology is historically dated with an optional scenario rule for bounded plausible acceleration.

Deferred until evidence exists:

- Which Sea Power debrief/save fields can reliably expose damage and ammunition.
- The telemetry sampling budget that has no meaningful frame-time impact.
- Exact campaign abstractions for mines, land war, strategic airlift, and nuclear escalation.
- Whether major covert operations become tactical missions or remain strategic resolutions.
- How much country-specific political detail is fun after the vertical slice.

## Immediate Next Steps

1. Execute backlog tasks `FND-001` through `FND-006` in order.
2. Lock scenario, API, and perspective contracts before creating the strategic map.
3. Build the setup workflow and a text/JSON campaign projection before styling the command center.
4. Implement deterministic time/movement and replay before adding Ollama.
5. Implement intelligence observations/tracks and perspective-leak tests before showing opponent data.
6. Do not generate a Sea Power mission until Foundation Gates A-F pass.

## References

- [DCS Liberation repository](https://github.com/dcs-liberation/dcs_liberation) - dynamic-campaign inspiration; this project does not copy its DCS-specific architecture.
- [NRO by the Numbers](https://www.nro.gov/Portals/135/documents/history/csnr/NRO_By_the_Numbers_Dec_2021_2.1.pdf) - KH-11 near-real-time imagery milestone in December 1976.
- [CIA declassified Soviet force assessment](https://www.cia.gov/readingroom/docs/1979-01-31b.pdf) - period assessment of EORSAT/RORSAT capabilities and limits.
- [CIA NIE 11-1-80 Soviet Military Capabilities](https://www.cia.gov/readingroom/docs/DOC_0000284010.pdf) - satellite ocean-surveillance coverage, targeting, and operational limitations.
- [NSA GRAB II history](https://www.nsa.gov/History/National-Cryptologic-Museum/Exhibits-Artifacts/Exhibit-View/Article/2718551/cold-war-grab-ii-elint-satellite/) - early US space-based ELINT background.
