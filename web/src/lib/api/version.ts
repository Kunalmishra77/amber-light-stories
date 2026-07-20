/**
 * Versioned public-API foundation (M8 / P2-12). The current stable major
 * version is served under `/api/v1`. New breaking versions mount a new prefix
 * (`/api/v2`) and bump SUPPORTED_VERSIONS — existing keys keep working against
 * older versions. Non-breaking additions ship within a version.
 */
export const API_VERSION = "v1" as const;
export const SUPPORTED_VERSIONS = ["v1"] as const;
export type ApiVersion = (typeof SUPPORTED_VERSIONS)[number];
