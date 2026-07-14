// logging — eine JSON-Zeile pro Ereignis auf stdout/stderr (Container-Konvention).
// logAudit trägt technische Sicherheits-Signale der Runtime (z.B. Host-Deny); fachliche
// Audit-Ereignisse laufen über die AuditSink-Naht (Ausbauschritt, Issue #11 Phase D).
export function logInfo(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", event, ...fields }));
}

export function logError(event: string, fields: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", event, ...fields }));
}

export function logAudit(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "warn", event, audit: true, ...fields }));
}
