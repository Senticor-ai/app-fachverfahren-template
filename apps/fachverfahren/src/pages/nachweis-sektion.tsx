// NachweisSektion — der Bürger-Upload/Download von Nachweisen auf der Antrags-Detailseite (die caseId
// existiert hier bereits, anders als im Einreich-Stepper). Die Bytes reisen base64 über den (server-
// austauschbaren) BlobStoragePort; der Server berechnet Größe + Prüfsumme. a11y: Datei-Label,
// role=status/alert, deaktiviert während Uploads.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@senticor/fachverfahren-kit";
import {
  ladeNachweise,
  nachweisHerunterladen,
  nachweisHochladen,
  type NachweisRefDto,
} from "../antrag-client.js";

/** File → base64 (ohne den `data:…;base64,`-Präfix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return reject(new Error("read failed"));
      const komma = result.indexOf(",");
      resolve(komma >= 0 ? result.slice(komma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function formatGroesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function NachweisSektion({
  antragId,
}: {
  antragId: string;
}): React.JSX.Element {
  const feldId = useId();
  const dateiRef = useRef<HTMLInputElement>(null);
  const [nachweise, setNachweise] = useState<NachweisRefDto[]>([]);
  const [datei, setDatei] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "laedt" | "sende" | "fehler">(
    "laedt",
  );

  const neuLaden = useCallback(async () => {
    try {
      setNachweise(await ladeNachweise(antragId));
    } catch {
      /* Liste bleibt wie sie ist; ein Upload-Fehler wird separat gemeldet. */
    }
  }, [antragId]);

  useEffect(() => {
    let ab = false;
    ladeNachweise(antragId)
      .then((n) => {
        if (!ab) setNachweise(n);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ab) setStatus("idle");
      });
    return () => {
      ab = true;
    };
  }, [antragId]);

  async function hochladen(): Promise<void> {
    if (!datei) return;
    setStatus("sende");
    try {
      const contentBase64 = await fileToBase64(datei);
      await nachweisHochladen(antragId, {
        fileName: datei.name,
        mimeType: datei.type || "application/octet-stream",
        contentBase64,
      });
      setDatei(null);
      if (dateiRef.current) dateiRef.current.value = "";
      await neuLaden();
      setStatus("idle");
    } catch {
      setStatus("fehler");
    }
  }

  async function herunterladen(ref: NachweisRefDto): Promise<void> {
    try {
      const dl = await nachweisHerunterladen(antragId, ref.attachmentId);
      const a = document.createElement("a");
      a.href = `data:${dl.mimeType};base64,${dl.contentBase64}`;
      a.download = dl.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setStatus("fehler");
    }
  }

  return (
    <div className="mt-6 rounded-md border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Nachweise</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Laden Sie Belege zu Ihrem Antrag hoch. Größe und Prüfsumme berechnet der
        Server.
      </p>

      {nachweise.length > 0 ? (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {nachweise.map((n) => (
            <li
              key={n.attachmentId}
              className="flex items-center justify-between gap-3 p-2 text-sm"
            >
              <span className="truncate text-foreground">
                {n.fileName}{" "}
                <span className="text-muted-foreground">
                  ({formatGroesse(n.sizeBytes)})
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void herunterladen(n)}
              >
                Herunterladen
              </Button>
            </li>
          ))}
        </ul>
      ) : status !== "laedt" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Noch keine Nachweise hochgeladen.
        </p>
      ) : null}

      <label htmlFor={feldId} className="mt-4 block text-sm text-muted-foreground">
        Datei wählen
      </label>
      <input
        ref={dateiRef}
        id={feldId}
        type="file"
        onChange={(e) => setDatei(e.target.files?.[0] ?? null)}
        className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void hochladen()}
          disabled={status === "sende" || datei === null}
        >
          Hochladen
        </Button>
        {status === "fehler" ? (
          <span className="text-sm text-destructive" role="alert">
            Upload/Download nicht möglich. Bitte erneut versuchen.
          </span>
        ) : null}
      </div>
    </div>
  );
}
