export type Language = "en" | "sv" | "es" | "de" | "fr";

export const LANGUAGES: Record<Language, string> = {
  en: "English",
  sv: "Svenska",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
};

export interface BrandColors {
  primary: string;
  secondary: string;
  text: string;
  background: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface Session {
  /** sha256 of the cookie token – the raw token is never stored. */
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface Brand {
  id: string;
  ownerId: string;
  name: string;
  headline?: string;
  website?: string;
  instagram?: string;
  industry: string;
  description: string;
  audience: string;
  voice: string;
  offers: string[];
  claimsToAvoid: string[];
  colors: BrandColors;
  logoUrl?: string;
  language: Language;
  /** Example Reels the owner wants to resemble (links). */
  referenceReels: string[];
  createdAt: string;
}

export interface MediaItem {
  id: string;
  brandId: string;
  fileName: string;
  mimeType: string;
  kind: "image" | "video";
  createdAt: string;
}

export type TemplateId = "showcase" | "beforeAfter" | "tips";

export interface Slide {
  text: string;
  mediaId?: string;
}

export interface ReelScript {
  template: TemplateId;
  hook: string;
  slides: Slide[];
  cta: string;
  caption: string;
  hashtags: string[];
}

export type ReelStatus = "draft" | "approved";

export interface Revision {
  request: string;
  at: string;
}

export interface Reel {
  id: string;
  brandId: string;
  topic: string;
  script: ReelScript;
  mediaIds: string[];
  status: ReelStatus;
  revisions: Revision[];
  renderFile?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanIdea {
  title: string;
  template: TemplateId;
  hook: string;
  needsMedia: string;
}

export interface Plan {
  brandId: string;
  ideas: PlanIdea[];
  createdAt: string;
}

/** Props passed to the Remotion composition (browser preview and MP4 render). */
export interface ReelRenderProps {
  brand: Pick<Brand, "name" | "colors" | "logoUrl">;
  script: ReelScript;
  media: { id: string; url: string; kind: "image" | "video" }[];
  [key: string]: unknown;
}
