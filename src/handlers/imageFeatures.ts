/**
 * Image feature allow-list — the data behind the feature-gated nav entries.
 *
 * An image may declare a `features` array inside its `Images.info` JSON blob
 * (`{"features":["players","worlds"]}`). The server sidebar and the mobile
 * bottom-nav use it to decide whether to show entries that carry a `feature:`
 * tag (`players`, `worlds`).
 *
 * The distinction this module exists to preserve:
 *
 * - **undeclared** (`info` missing, not an object, or no `features` key) →
 *   `null` → *show everything*. Missing metadata must never hide a page.
 * - **declared** (a real array) → that array is an allow-list and filters,
 *   including the explicit empty array, which means "show none of them".
 *
 * That is why the render local is `string[] | null` and not `string[]`: `[]`
 * is a valid answer, `null` is "no answer". Collapsing the two is exactly the
 * bug that hid Players and Worlds from every server page (instructions.md §15.3).
 *
 * This lives in `handlers/` rather than next to its callers so that
 * `handlers/utils/auth/serverAuthUtil.ts` can use it without importing the
 * `modules/user/server` tree (and its daemon/realtime dependencies).
 */

export interface ImageWithInfo {
  info?: string | null;
}

export function getImageFeaturesOrNull(
  image: ImageWithInfo | null | undefined,
): string[] | null {
  if (!image) {
    return null;
  }
  try {
    const info =
      typeof image.info === 'string' ? JSON.parse(image.info) : image.info;
    if (!info || typeof info !== 'object') {
      return null;
    }
    return Array.isArray(info.features) ? info.features : null;
  } catch {
    // Unparseable `info` is treated as undeclared rather than as "no features":
    // a corrupt blob should degrade to showing the nav, not hiding it.
    return null;
  }
}

/**
 * Array-shaped form for callers that need to iterate unconditionally
 * (`features.includes('eula')`, JSON response bodies). Undeclared → `[]`.
 */
export function getImageFeatures(image: ImageWithInfo | null | undefined) {
  return getImageFeaturesOrNull(image) ?? [];
}
