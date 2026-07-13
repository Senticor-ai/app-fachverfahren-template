// board-client.test.ts — der HTTP-Client der Board-Routen. Kernfall: antwortet der Server KEIN
// JSON (SPA-Fallback ohne Proxy, falsch konfigurierter Reverse-Proxy), muss ein diagnostizierbarer
// BoardRequestError entstehen — nie eine nackte SyntaxError aus response.json().
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardRequestError, createBoardClient } from "../src/board-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: () => Response): void {
  vi.stubGlobal("fetch", () => Promise.resolve(response()));
}

describe("board-client request", () => {
  it("HTML-Antwort (SPA-Fallback) → BoardRequestError statt SyntaxError", async () => {
    stubFetch(
      () =>
        new Response("<!doctype html>\n<html></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );
    const rejection = expect(createBoardClient().listBoards()).rejects;
    await rejection.toBeInstanceOf(BoardRequestError);
  });

  it("JSON-Antwort → geparste Boards", async () => {
    const boards = [{ id: "b1", title: "Team" }];
    stubFetch(
      () =>
        new Response(JSON.stringify(boards), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
    );
    await expect(createBoardClient().listBoards()).resolves.toEqual(boards);
  });
});
