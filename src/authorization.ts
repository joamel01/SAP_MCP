import type { ServerConfig, SupportedObjectType } from "./types.js";
import { wildcardMatch } from "./utils.js";

export function assertAllowedObjectType(config: ServerConfig, objectType: string): asserts objectType is SupportedObjectType {
  if (!config.allowedObjectTypes.includes(objectType as SupportedObjectType)) {
    throw new Error(
      `Object type '${objectType}' is not allowed. Allowed: ${config.allowedObjectTypes.join(", ")}`,
    );
  }
}

export function assertAllowedPackage(config: ServerConfig, packageName: string | undefined): void {
  if (!packageName || config.allowedPackages.length === 0) {
    return;
  }

  const allowed = config.allowedPackages.some((pattern) => wildcardMatch(pattern, packageName));
  if (!allowed) {
    throw new Error(
      `Package '${packageName}' is not allowed. Allowed patterns: ${config.allowedPackages.join(", ")}`,
    );
  }
}
