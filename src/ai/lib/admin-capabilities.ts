/**
 * Jimskay AI — Unified Admin Capability Registry
 *
 * This registry gives Admin Mode one coherent capability vocabulary.
 * Individual capabilities are still enforced by their implementation
 * and by confirmation gates for consequential actions.
 */

export const ADMIN_CAPABILITIES = [
  "desktop.observe",
  "desktop.screenshot",
  "desktop.mouse",
  "desktop.keyboard",
  "desktop.windows",
  "desktop.apps",
  "desktop.clipboard",
  "desktop.media",
  "files.read",
  "files.write",
  "files.copy",
  "files.move",
  "files.rename",
  "files.delete",
  "process.inspect",
  "process.start",
  "process.stop",
  "terminal.run",
  "browser.open",
  "browser.navigate",
  "browser.interact",
  "browser.observe",
  "automation.schedule",
  "automation.run",
  "development.edit",
  "development.test",
  "documents.create",
  "documents.edit",
  "notifications.show",
  "system.info",
  "system.settings",
] as const;

export type AdminCapability = typeof ADMIN_CAPABILITIES[number];

export type AdminActionRisk =
  | "read"
  | "reversible"
  | "consequential";

const CONSEQUENTIAL_CAPABILITIES = new Set<AdminCapability>([
  "files.delete",
  "process.stop",
]);

export function capabilityRisk(capability: AdminCapability): AdminActionRisk {
  if (CONSEQUENTIAL_CAPABILITIES.has(capability)) return "consequential";
  if (
    capability.endsWith(".write") ||
    capability.endsWith(".move") ||
    capability.endsWith(".rename") ||
    capability.endsWith(".start") ||
    capability.endsWith(".run") ||
    capability.endsWith(".interact") ||
    capability === "automation.schedule"
  ) return "reversible";
  return "read";
}
