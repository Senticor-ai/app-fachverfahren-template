import {
  assertPublicRuntimeConfig,
  type PublicRuntimeConfig,
} from "@senticor/public-sector-sdk";
import { defaultPublicRuntimeConfig } from "./default-runtime.js";

export async function loadPublicRuntimeConfig(): Promise<PublicRuntimeConfig> {
  try {
    // `no-store`: die Identität (Behörde/Titel) wird vom Build frisch geschrieben — nie aus dem Browser-Cache lesen,
    // sonst zeigt ein erneuter Aufruf das alte Template-Gerüst statt des generierten Verfahrens.
    const response = await fetch("/runtime-config.json", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return defaultPublicRuntimeConfig;
    }
    // PARTIELLES Override: der governte Build erzeugt `runtime-config.json` mit der ECHTEN Identität des
    // generierten Fachverfahrens (application.displayName = Verfahrenstitel, authority.displayName = Behörde/Kommune)
    // — und NUR diese Felder. Der Rest (Jurisdiktion, Tenant, Capabilities) bleibt die valide Default-Verfassung.
    // So wird die laufende App zur <Verfahren>-App (Titel, Login, Behörde) statt zum Template-Gerüst, ohne dass der
    // Build eine vollständige PublicRuntimeConfig konstruieren muss.
    const raw = (await response.json()) as {
      application?: Partial<PublicRuntimeConfig["application"]>;
      authority?: Partial<PublicRuntimeConfig["authority"]>;
    } & Partial<PublicRuntimeConfig>;
    const merged = {
      ...defaultPublicRuntimeConfig,
      ...raw,
      application: { ...defaultPublicRuntimeConfig.application, ...(raw.application ?? {}) },
      authority: { ...defaultPublicRuntimeConfig.authority, ...(raw.authority ?? {}) },
    };
    return assertPublicRuntimeConfig(merged);
  } catch {
    return defaultPublicRuntimeConfig;
  }
}
