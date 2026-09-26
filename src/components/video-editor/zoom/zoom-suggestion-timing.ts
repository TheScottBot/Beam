// Timing shared by click and typing suggestions. It lives apart from `zoom-suggestions.ts` so the
// typing modules can use it without importing the module that imports them.

/** Clicks, and keystrokes, further apart than this belong to separate moments. */
export const CLICK_CLUSTER_GAP_MS = 2500;
/** Kept around the interaction a zoom is for, so the camera is not cut away the instant it ends. */
export const ZOOM_REGION_PADDING_MS = 500;
