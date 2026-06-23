import {
  assertPublicRuntimeConfig,
  type PublicRuntimeConfig,
} from "@senticor/public-sector-sdk";
import { defaultPublicRuntimeConfig } from "./default-runtime.js";

export async function loadPublicRuntimeConfig(): Promise<PublicRuntimeConfig> {
  try {
    const response = await fetch("/runtime-config.json", {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return defaultPublicRuntimeConfig;
    }
    return assertPublicRuntimeConfig(await response.json());
  } catch {
    return defaultPublicRuntimeConfig;
  }
}
