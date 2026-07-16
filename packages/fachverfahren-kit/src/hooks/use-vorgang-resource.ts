import { useCallback, useEffect, useRef, useState } from "react";
import type { Vorgang, VorgangPort } from "../types.js";

export type ResourceState<T> =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; error: Error; retry: () => void }
  | { status: "success"; data: T };

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/** Load a single Vorgang with loading/error/retry and stale-response protection. */
export function useVorgang<T = Record<string, unknown>>(
  port: VorgangPort<T>,
  id: string | undefined,
): ResourceState<Vorgang<T>> {
  const [state, setState] = useState<ResourceState<Vorgang<T>>>({
    status: "loading",
  });
  const gen = useRef(0);

  const load = useCallback(() => {
    if (!id) {
      setState({ status: "empty" });
      return;
    }
    const my = ++gen.current;
    setState({ status: "loading" });
    void port
      .get(id)
      .then((data) => {
        if (my !== gen.current) return;
        setState(data ? { status: "success", data } : { status: "empty" });
      })
      .catch((err: unknown) => {
        if (my !== gen.current) return;
        setState({
          status: "error",
          error: toError(err),
          retry: () => load(),
        });
      });
  }, [port, id]);

  useEffect(() => {
    load();
    return () => {
      gen.current += 1;
    };
  }, [load]);

  return state;
}

export function useVorgaenge<T = Record<string, unknown>>(
  port: VorgangPort<T>,
  query?: {
    states?: string[];
    search?: string;
    limit?: number;
  },
): ResourceState<Vorgang<T>[]> {
  const [state, setState] = useState<ResourceState<Vorgang<T>[]>>({
    status: "loading",
  });
  const gen = useRef(0);
  const queryKey = JSON.stringify(query ?? {});

  const load = useCallback(() => {
    const my = ++gen.current;
    setState({ status: "loading" });
    void port
      .list(query)
      .then((data) => {
        if (my !== gen.current) return;
        setState(
          data.length === 0 ? { status: "empty" } : { status: "success", data },
        );
      })
      .catch((err: unknown) => {
        if (my !== gen.current) return;
        setState({
          status: "error",
          error: toError(err),
          retry: () => load(),
        });
      });
    // queryKey tracks deep query changes; query is intentionally excluded
  }, [port, queryKey]);

  useEffect(() => {
    load();
    return () => {
      gen.current += 1;
    };
  }, [load]);

  return state;
}

export function useEinreichen<T = Record<string, unknown>>(
  port: VorgangPort<T>,
): {
  pending: boolean;
  error: Error | null;
  einreichen: (
    antragsdaten: T,
    erbrachteNachweise?: Record<
      string,
      { name: string; groesse: number; attachmentId?: string } | null
    >,
  ) => Promise<Vorgang<T> | undefined>;
  reset: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const inFlight = useRef(false);

  const einreichen = useCallback(
    async (
      antragsdaten: T,
      erbrachteNachweise?: Record<
        string,
        { name: string; groesse: number; attachmentId?: string } | null
      >,
    ) => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);
      setError(null);
      try {
        const idempotencyKey =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `idem-${Date.now()}`;
        return await port.einreichen(antragsdaten, erbrachteNachweise, {
          idempotencyKey,
        });
      } catch (err) {
        setError(toError(err));
        return undefined;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [port],
  );

  return {
    pending,
    error,
    einreichen,
    reset: () => setError(null),
  };
}

export function useUebergang<T = Record<string, unknown>>(
  port: VorgangPort<T>,
): {
  pending: boolean;
  error: Error | null;
  uebergang: (
    id: string,
    eventName: string,
    rolle: string,
    detail?: string,
    akteur?: string,
    opts?: { expectedVersion?: number },
  ) => Promise<Vorgang<T> | undefined>;
  reset: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const inFlight = useRef(false);

  const uebergang = useCallback(
    async (
      id: string,
      eventName: string,
      rolle: string,
      detail?: string,
      akteur?: string,
      opts?: { expectedVersion?: number },
    ) => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);
      setError(null);
      try {
        const idempotencyKey =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `idem-${Date.now()}`;
        return await port.uebergang(id, eventName, rolle, detail, akteur, {
          ...(opts?.expectedVersion !== undefined
            ? { expectedVersion: opts.expectedVersion }
            : {}),
          idempotencyKey,
        });
      } catch (err) {
        setError(toError(err));
        return undefined;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [port],
  );

  return {
    pending,
    error,
    uebergang,
    reset: () => setError(null),
  };
}
