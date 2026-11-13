import { pickStyle, type StyleId } from "./styles";
import type { Brand } from "./types";

/** A picked look: a built-in style id, or "ref:<id>" for a look learned from a reference video. */
export type LookValue = StyleId | `ref:${string}`;

export function initialLook(brand: Pick<Brand, "industry" | "description" | "offers" | "defaultStyle" | "references" | "defaultReferenceId">): LookValue {
  if (brand.defaultReferenceId && brand.references?.some((r) => r.id === brand.defaultReferenceId)) return `ref:${brand.defaultReferenceId}`;
  return pickStyle(brand);
}

/** What to send to the server for a picked look. */
export function lookPayload(v: LookValue): { style?: StyleId; referenceId?: string } {
  return v.startsWith("ref:") ? { referenceId: v.slice(4) } : { style: v as StyleId };
}

