// RuntimeConfigProvider — die EINE Client-Naht zur asynchronen `/runtime-config.json` (Skalierungsplan #4 + #3).
//
// Bisher las `main.tsx` aus der Runtime-Konfig NUR `delivery.serviceWorkerEnabled` und verwarf den Rest (Application/
// Tenant/Branding) — die „Runtime-Portal-Schicht" war tot. Dieser Provider holt die Konfig EINMAL, stellt sie per
// Context bereit (application/tenant/branding/delivery) UND übersetzt den optionalen `branding`-Block in ein
// `KommuneTheme`, das `KommuneBranding` in den (bislang nie gemounteten) `KommuneThemeProvider` speist. Damit greift
// das White-Labeling: Wappen + Markenfarben erscheinen, `useKommuneTheme()` liefert nicht mehr immer `null`.
//
// PRIORITÄT: Runtime-Branding (Server-`APP_BRAND_*`) schlägt das Build-Zeit-`fallback` (Portal-Marke aus der
// Registry). Ohne beides = neutrales Default-Kit (rückwärtskompatibel). Der Service-Worker wird hier — an EINER
// Stelle — registriert (vorher in `main.tsx`), sodass die Konfig nur einmal geladen wird.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  KommuneThemeProvider,
  registerServiceWorker,
  type KommuneBrand,
  type KommuneLogoAsset,
  type KommuneTheme,
} from "@senticor/fachverfahren-kit";

/** Flacher `branding`-Block, wie ihn der Server aus `APP_BRAND_*` emittiert (alle Felder optional). */
export interface RuntimeBranding {
  name?: string;
  primary?: string;
  primaryForeground?: string;
  accent?: string;
  accentForeground?: string;
  ring?: string;
  surface?: string;
  rail?: string;
  logoSrc?: string;
  logoAlt?: string;
  logoHref?: string;
  sourceUrl?: string;
  sourceGeprueftAm?: string;
  sourceVerifiziert?: boolean;
}

/** Der öffentliche Teil der Runtime-Konfiguration (Schema `public-runtime.v1`, additiv um `branding` erweitert). */
export interface RuntimeConfig {
  application?: {
    applicationId?: string;
    displayName?: string;
    version?: string;
  };
  tenant?: { tenantId?: string; label?: string };
  branding?: RuntimeBranding;
  delivery?: { publicBaseUrl?: string; serviceWorkerEnabled?: boolean };
}

/**
 * Übersetzt den flachen Runtime-`branding`-Block in ein `KommuneTheme` (oder `null`, wenn nichts Verwertbares
 * gesetzt ist). Es werden NUR gesetzte Schlüssel übernommen (exactOptionalPropertyTypes-konform). `fallbackName`
 * trägt einen Anzeigenamen, wenn `branding` keinen mitbringt.
 */
export function brandingZuTheme(
  b: RuntimeBranding | undefined,
  fallbackName?: string,
): KommuneTheme | null {
  const name = b?.name ?? fallbackName;
  const brand: KommuneBrand = {};
  if (b?.primary) brand.primary = b.primary;
  if (b?.primaryForeground) brand.primaryForeground = b.primaryForeground;
  if (b?.accent) brand.accent = b.accent;
  if (b?.accentForeground) brand.accentForeground = b.accentForeground;
  if (b?.ring) brand.ring = b.ring;
  if (b?.surface) brand.surface = b.surface;
  if (b?.rail) brand.rail = b.rail;
  const hatBrand = Object.keys(brand).length > 0;

  const logo: KommuneLogoAsset | undefined = b?.logoSrc
    ? {
        src: b.logoSrc,
        alt: b.logoAlt ?? (name ? `Logo ${name}` : "Logo"),
        ...(b.logoHref ? { href: b.logoHref } : {}),
      }
    : undefined;

  const quelle = b?.sourceUrl
    ? {
        url: b.sourceUrl,
        ...(b.sourceGeprueftAm ? { geprueftAm: b.sourceGeprueftAm } : {}),
        ...(b.sourceVerifiziert !== undefined
          ? { verifiziert: b.sourceVerifiziert }
          : {}),
      }
    : undefined;

  if (!name && !hatBrand && !logo) return null;
  return {
    name: name ?? "",
    ...(hatBrand ? { brand } : {}),
    ...(logo ? { logo } : {}),
    ...(quelle ? { quelle } : {}),
  };
}

const RuntimeConfigContext = createContext<RuntimeConfig>({});

/** Liefert die (asynchron geladene) Runtime-Konfiguration. Vor dem Laden/ohne Server = leeres Objekt. */
export function useRuntimeConfig(): RuntimeConfig {
  return useContext(RuntimeConfigContext);
}

/**
 * Lädt `/runtime-config.json` EINMAL, stellt sie per Context bereit und registriert (falls aktiviert) den
 * Service-Worker. Fehlt die Datei (DEV/Standalone) oder ist sie fehlerhaft, bleibt die Konfig leer — die App
 * startet unverändert.
 */
export function RuntimeConfigProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [config, setConfig] = useState<RuntimeConfig>({});
  useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      try {
        // BASE-AWARE (Wurzel „runtime-config 404 im Preview"): die App wird unter einem PRÄFIX ausgeliefert (Vite-Base
        // import.meta.env.BASE_URL, z. B. /flow/preview/<sid>/ oder ein Deploy-Sub-Pfad). Ein ABSOLUTER Pfad
        // "/runtime-config.json" umgeht die Base → landet am Origin-ROOT → 404/SPA-Fallback. Relativ zur Base laden, damit
        // public/runtime-config.json (dort ausgeliefert) gefunden wird. BASE_URL endet per Vite-Konvention mit "/".
        const antwort = await fetch(`${import.meta.env.BASE_URL}runtime-config.json`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!antwort.ok || abgebrochen) return;
        // Ein FEHLENDES runtime-config.json kann unter einem SPA-Fallback als index.html mit Status 200 zurückkommen —
        // dann bräche `.json()` mit „Unexpected token '<' … is not valid JSON". Nur parsen, wenn es wirklich JSON ist.
        if (!(antwort.headers.get("content-type") || "").toLowerCase().includes("application/json")) return;
        const geladen = (await antwort.json()) as RuntimeConfig;
        if (abgebrochen) return;
        setConfig(geladen);
        if (geladen.delivery?.serviceWorkerEnabled === true) {
          await registerServiceWorker(`${import.meta.env.BASE_URL}service-worker.js`);
        }
      } catch {
        // Die Runtime-Konfiguration ist eine Verbesserung fuer Deployments; die App startet auch ohne sie.
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, []);
  return (
    <RuntimeConfigContext.Provider value={config}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

/**
 * Mountet den `KommuneThemeProvider` mit dem effektiven Theme: Runtime-`branding` (Server) schlägt das Build-Zeit-
 * `fallback` (Portal-Marke aus der Registry). Genau einmal nahe der App-Wurzel, INNERHALB des
 * `RuntimeConfigProvider`, rendern.
 */
export function KommuneBranding({
  fallback,
  children,
}: {
  fallback?: KommuneTheme | null;
  children: ReactNode;
}): React.JSX.Element {
  const rc = useRuntimeConfig();
  const theme = brandingZuTheme(rc.branding) ?? fallback ?? null;
  return <KommuneThemeProvider theme={theme}>{children}</KommuneThemeProvider>;
}
