export type SocialPlatformId =
  | "instagram"
  | "facebook"
  | "youtube"
  | "linkedin"
  | "tiktok"
  | "vimeo";

export interface SocialNetworkConfig {
  id: SocialPlatformId;
  name: string;
  allowedDomains: readonly string[];
}

export interface SocialNetworkEntry {
  url: string;
  enabled: boolean;
}

export type SocialNetworksState = Record<SocialPlatformId, SocialNetworkEntry>;

export const SOCIAL_PLATFORMS: readonly SocialNetworkConfig[] = [
  {
    id: "instagram",
    name: "Instagram",
    allowedDomains: ["instagram.com"],
  },
  {
    id: "facebook",
    name: "Facebook",
    allowedDomains: ["facebook.com"],
  },
  {
    id: "youtube",
    name: "YouTube",
    allowedDomains: ["youtube.com", "youtu.be"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    allowedDomains: ["linkedin.com"],
  },
  {
    id: "tiktok",
    name: "TikTok",
    allowedDomains: ["tiktok.com"],
  },
  {
    id: "vimeo",
    name: "Vimeo",
    allowedDomains: ["vimeo.com"],
  },
] as const;

export const SOCIAL_PLATFORM_IDS = SOCIAL_PLATFORMS.map((p) => p.id) as readonly SocialPlatformId[];

export const DEFAULT_SOCIAL_NETWORKS: SocialNetworksState = {
  instagram: { url: "", enabled: false },
  facebook: { url: "", enabled: false },
  youtube: { url: "", enabled: false },
  linkedin: { url: "", enabled: false },
  tiktok: { url: "", enabled: false },
  vimeo: { url: "", enabled: false },
};

/**
 * Validates a social network URL against strict security rules:
 * - Must be https:
 * - Must not be a relative URL
 * - Must not contain embedded credentials (username/password)
 * - Domain must match the platform's official domains or subdomains (rejecting deceptive domains like instagram.com.example.org)
 */
export function isValidSocialUrl(
  platformId: SocialPlatformId,
  urlString: string | null | undefined
): boolean {
  if (!urlString || typeof urlString !== "string") {
    return false;
  }
  const trimmed = urlString.trim();
  if (!trimmed) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  // Protocole https: obligatoire
  if (parsed.protocol !== "https:") {
    return false;
  }

  // Aucun identifiant ou mot de passe intégré
  if (parsed.username || parsed.password) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  const config = SOCIAL_PLATFORMS.find((p) => p.id === platformId);
  if (!config) {
    return false;
  }

  return config.allowedDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

export interface ActiveSocialNetwork {
  id: SocialPlatformId;
  name: string;
  url: string;
}

/**
 * Returns only the active and valid social networks in the order of the central registry.
 * Frontend views should always rely on this function to ensure invalid or disabled URLs are never rendered.
 */
export function getActiveSocialNetworks(
  networks?: Partial<Record<SocialPlatformId, SocialNetworkEntry>> | null
): ActiveSocialNetwork[] {
  if (!networks) {
    return [];
  }
  const result: ActiveSocialNetwork[] = [];

  for (const config of SOCIAL_PLATFORMS) {
    const entry = networks[config.id];
    if (entry && entry.enabled && isValidSocialUrl(config.id, entry.url)) {
      result.push({
        id: config.id,
        name: config.name,
        url: entry.url.trim(),
      });
    }
  }

  return result;
}
