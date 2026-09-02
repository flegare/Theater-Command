export type MissionAreaProfile = "auto" | "coastal" | "littoral" | "open_ocean";

export type MissionModuleId =
  "fisherman_intel_reports" | "refinery_state_continuity";

export type MissionCampaignState = {
  destroyedInfrastructureTags?: string[];
};

export type MissionGenerationConfig = {
  areaProfile?: MissionAreaProfile;
  enabledModules?: MissionModuleId[];
  disabledModules?: MissionModuleId[];
  campaignState?: MissionCampaignState;
};

export type ResolvedMissionModules = {
  areaProfile: Exclude<MissionAreaProfile, "auto">;
  enabledModules: Set<MissionModuleId>;
  isEnabled: (moduleId: MissionModuleId) => boolean;
};
