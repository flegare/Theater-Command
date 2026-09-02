# 10 — Spy Ship Surrender: Implementation Plan

## Goal

Give selected intelligence-collection vessels (for example AGIs) a credible, non-lethal end-state.
When sufficiently damaged, they should stop fighting and signal surrender rather than routinely
being sunk. This is intended for controlled escalation missions, not a universal rule for all
hostile ships.

## Intended player-facing behaviour

1. The AGI begins hostile or evasive according to the scenario.
2. Once its remaining health is below **50%**, it becomes eligible to surrender.
3. It must still be afloat and must not already be surrendered.
4. It stops, holds weapons, and emits a clear radio/mission message that it is surrendering.
5. The player can approach and inspect it. The initial version will treat that as successful
   containment; it will not require a boarding animation.
6. If the game exposes enough scripting support, a second phase may spawn a small boat after a
   Blue vessel is within **1 nm**. This must be optional and never block the basic surrender flow.

## What is known today

- The generated Bergen mission creates the AGI as a normal `Taskforce2Vessel` patrol unit.
- No generated trigger currently watches its damage/health, changes its orders, or shows a
  surrender message. Therefore an AGI at 60/78 damage correctly continues its normal behaviour.
- The generated mission should remain deliberately thin. Earlier mission scripts caused a Sea
  Power script-runtime startup timeout, so unsupported scripting must not be emitted blindly.
- The local authoritative source is
  `docs/official/Mission Editor. Triggers and conditions.docx`. The quick reference in
  [`03-triggers-and-conditions.md`](03-triggers-and-conditions.md) is useful, but not sufficient
  to assume a health-damage condition or a boarding action exists.

## Staged TODO

- [ ] **Audit the official trigger catalogue and shipped missions.** Identify the exact supported
  condition for a unit reaching a health/damage threshold, plus actions that can stop a vessel,
  alter weapon status, alter side/AI behaviour, and display a message. Record exact `.ini` keys
  and one known-good example for each.
- [ ] **Build an isolated hand-authored test mission.** One Blue ship and one damaged AGI, with no
  campaign generator involved. Verify that the condition fires at the intended threshold without
  any `Script runtime startup failed` error.
- [ ] **Define a minimal surrender state.** Prefer native trigger actions over custom runtime code:
  set weapons safe/hold, stop or assign a safe loiter waypoint, flag the unit as surrendered, and
  show an unambiguous message. Do not change the AGI's faction unless the engine explicitly
  supports that safely.
- [ ] **Add a one-shot guard.** The surrender trigger must run once only, skip sunk units, and not
  compete with other mission triggers. Give it stable generated IDs and a `surrendered` marker so
  campaign-generated missions are reproducible.
- [ ] **Integrate it as an opt-in mission feature.** Add structured fields such as
  `surrenderPolicy` / `surrenderAtHealthFraction` to the mission model. Apply it to eligible
  reconnaissance vessels only, initially `wp_agi_okean_mod`.
- [ ] **Expose the outcome to the player.** Add objective/briefing text such as “Compel the AGI to
  heave to; avoid sinking it.” A completed state should be visible both in Sea Power's mission UI
  and, where applicable, the campaign result returned to the website.
- [ ] **Test generated missions.** Add unit tests for emitted trigger sections and mission
  metadata; run the project checks, build, and Playwright test. Then launch the `.ini` in Sea
  Power and exercise: no damage, 49% health, under 50% health, sinking before trigger, and reload.
- [ ] **Evaluate the 1 nm small-boat interaction separately.** Confirm whether the editor can
  spawn a boat at runtime, create a movement order, and detect proximity. Only then add a Zodiac
  or boarding craft as a second scripted phase. If unsupported, represent boarding through the
  mission message and objective completion instead.

## Acceptance criteria for the first release

- A damaged eligible AGI at less than 50% health visibly ceases hostile action and announces
  surrender exactly once.
- An undamaged AGI behaves normally.
- The mission loads without script-runtime errors or noticeable startup delay.
- The surrender logic does not apply to submarines, combatants, merchant vessels, or civilian
  traffic unless a mission explicitly opts them in.
- The generated `.ini` remains deterministic for a fixed campaign seed and has automated output
  coverage plus a manually validated in-game sample.

## Open technical questions

1. Does the mission-editor trigger system have a direct remaining-health/damage threshold
   condition, and what is its exact syntax?
2. Can a trigger reliably set a vessel's speed, AI posture, and weapon status after spawn?
3. Can a trigger create a unit at runtime and position it relative to a vessel, or must a disabled
   Zodiac be pre-placed and enabled?
4. Is there a supported proximity condition for “a Blue surface unit within 1 nm of this AGI”?
5. Which surrender actions survive save/load and campaign hand-off?

Until those answers are verified against the shipped documentation and a standalone in-game test,
the mission generator must not claim that AGI surrender is active.
