// security-headers — CSP (enforce oder report-only), HSTS, nosniff, Referrer- und
// Permissions-Policy auf JEDER Antwort des public Ports (onRequest-Hook, siehe hooks.ts).
import type { FastifyReply } from "fastify";
import type { RuntimeConfig } from "./config.js";

export function applySecurityHeaders(
  reply: FastifyReply,
  config: RuntimeConfig,
) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${config.frameAncestors}`,
  ].join("; ");
  reply.header(
    config.cspMode === "report-only"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    csp,
  );
  if (config.enableHsts) {
    reply.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
}
