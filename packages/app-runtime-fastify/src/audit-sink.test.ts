import { describe, expect, it, vi } from "vitest";
import { createSecurityEvent } from "@senticor/public-sector-sdk";
import {
  ConsoleAuditSink,
  createAuditSinkFromEnv,
  MemoryAuditSink,
  NoopAuditSink,
} from "./audit-sink.js";

const securityEvent = () =>
  ({
    kind: "security",
    event: createSecurityEvent({
      eventType: "bff.session.missing",
      requestId: "req-1",
      severity: "info",
    }),
  }) as const;

describe("AuditSink", () => {
  it("MemoryAuditSink sammelt Ereignisse in Reihenfolge", async () => {
    const sink = new MemoryAuditSink();
    await sink.emit(securityEvent());
    await sink.emit(securityEvent());
    expect(sink.events).toHaveLength(2);
    expect(sink.events[0]?.kind).toBe("security");
  });

  it("ConsoleAuditSink schreibt genau EINE JSON-Zeile auf stdout", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await new ConsoleAuditSink().emit(securityEvent());
      expect(write).toHaveBeenCalledTimes(1);
      const line = String(write.mock.calls[0]?.[0]);
      expect(line.endsWith("\n")).toBe(true);
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(parsed["level"]).toBe("audit");
      expect(parsed["kind"]).toBe("security");
      expect(parsed["eventType"]).toBe("bff.session.missing");
    } finally {
      write.mockRestore();
    }
  });

  it("NoopAuditSink verwirft Ereignisse ohne Ausgabe", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await new NoopAuditSink().emit(securityEvent());
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("createAuditSinkFromEnv: console (Default), noop, unbekannt wirft", () => {
    expect(createAuditSinkFromEnv({})).toBeInstanceOf(ConsoleAuditSink);
    expect(
      createAuditSinkFromEnv({ APP_AUDIT_SINK: "console" }),
    ).toBeInstanceOf(ConsoleAuditSink);
    expect(createAuditSinkFromEnv({ APP_AUDIT_SINK: "noop" })).toBeInstanceOf(
      NoopAuditSink,
    );
    expect(() => createAuditSinkFromEnv({ APP_AUDIT_SINK: "kaputt" })).toThrow(
      /APP_AUDIT_SINK/,
    );
  });
});
