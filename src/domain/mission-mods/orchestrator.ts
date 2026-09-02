import type { GeneratedLaneMission } from "../laneMission.js";
import type {
  MissionGenerationConfig,
  MissionModuleId,
  ResolvedMissionModules,
} from "./types.js";

export type MissionModuleSignals = {
  hasFishingZones: boolean;
  hasRefineryObjective: boolean;
};

function inferAreaProfile(
  mission: GeneratedLaneMission,
): ResolvedMissionModules["areaProfile"] {
  const metadata = `${mission.laneId} ${mission.laneName}`.toLowerCase();
  if (
    mission.nativeZones?.some((zone) =>
      /fish|coast|fjord|port|harbor/.test(
        `${zone.id} ${zone.label} ${zone.labelKey}`.toLowerCase(),
      ),
    )
  ) {
    return "coastal";
  }
  if (/bergen|scapa|norway|gulf|strait|coast|fjord|littoral/.test(metadata)) {
    return "coastal";
  }
  return "open_ocean";
}

function hasDestroyedTag(
  config: MissionGenerationConfig | undefined,
  pattern: RegExp,
): boolean {
  const tags = config?.campaignState?.destroyedInfrastructureTags ?? [];
  return tags.some((tag) => pattern.test(tag.toLowerCase()));
}

export function resolveMissionModules(
  mission: GeneratedLaneMission,
  config: MissionGenerationConfig | undefined,
  signals: MissionModuleSignals,
): ResolvedMissionModules {
  const areaProfile =
    config?.areaProfile && config.areaProfile !== "auto"
      ? config.areaProfile
      : inferAreaProfile(mission);

  const enabled = new Set<MissionModuleId>();

  if (
    (areaProfile === "coastal" || areaProfile === "littoral") &&
    signals.hasFishingZones
  ) {
    enabled.add("fisherman_intel_reports");
  }

  if (signals.hasRefineryObjective) {
    enabled.add("refinery_state_continuity");
  }

  if (hasDestroyedTag(config, /refinery|oil|terminal|fuel/)) {
    enabled.delete("refinery_state_continuity");
  }

  for (const moduleId of config?.enabledModules ?? []) enabled.add(moduleId);
  for (const moduleId of config?.disabledModules ?? [])
    enabled.delete(moduleId);

  return {
    areaProfile,
    enabledModules: enabled,
    isEnabled: (moduleId) => enabled.has(moduleId),
  };
}
