export interface ResourceMatchResult {
  valid: boolean;
  matched: boolean;
  normalized?: string;
  reason?: string;
}

export function normalizeIntentResource(resource: string): ResourceMatchResult {
  const trimmed = resource.trim();

  if (trimmed.length === 0) {
    return { valid: false, matched: false, reason: "Resource must not be empty." };
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return { valid: false, matched: false, reason: "Absolute resource paths are outside scope." };
  }

  const slashNormalized = trimmed.replaceAll("\\", "/");

  if (slashNormalized.startsWith("/")) {
    return { valid: false, matched: false, reason: "Absolute resource paths are outside scope." };
  }

  const segments = slashNormalized.split("/");

  if (segments.some((segment) => segment === "..")) {
    return { valid: false, matched: false, reason: "Resource traversal is outside scope." };
  }

  const normalizedSegments = segments.filter((segment) => segment.length > 0 && segment !== ".");
  const normalized = slashNormalized.endsWith("/")
    ? `${normalizedSegments.join("/")}/`
    : normalizedSegments.join("/");

  if (normalized.length === 0) {
    return { valid: false, matched: false, reason: "Resource must not be empty." };
  }

  return { valid: true, matched: false, normalized };
}

export function resourceMatchesPrefix(resource: string, prefix: string): boolean {
  const normalizedResource = normalizeIntentResource(resource);
  const normalizedPrefix = normalizeIntentResource(prefix);

  if (!normalizedResource.valid || !normalizedResource.normalized) {
    return false;
  }

  if (!normalizedPrefix.valid || !normalizedPrefix.normalized) {
    return false;
  }

  const candidate = normalizedResource.normalized;
  const pattern = normalizedPrefix.normalized;

  if (pattern.endsWith("/**")) {
    const base = pattern.slice(0, -2);
    return candidate === base || candidate.startsWith(base);
  }

  return candidate === pattern;
}

export function matchAllowedResource(resource: string, prefixes: string[]): ResourceMatchResult {
  const normalizedResource = normalizeIntentResource(resource);

  if (!normalizedResource.valid || !normalizedResource.normalized) {
    return normalizedResource;
  }

  const matched = prefixes.some((prefix) => resourceMatchesPrefix(normalizedResource.normalized!, prefix));

  return {
    valid: true,
    matched,
    normalized: normalizedResource.normalized
  };
}
