// Cache-Politik-Konstanten des Web-Delivery-Vertrags (redeploy-sicher): alles außer
// content-gehashten Assets ist no-store; gehashte Assets sind ein Jahr immutable.
export const NO_STORE = "no-store";
export const IMMUTABLE = "public, max-age=31536000, immutable";
