import { createLocalPlatformPorts } from "@senticor/platform-contracts";
import type { ServiceBinding } from "@senticor/public-sector-sdk";

export interface LocalProviderPack {
  providerId: "local";
  bindings: ServiceBinding[];
  ports: ReturnType<typeof createLocalPlatformPorts>;
}

export function createLocalProviderPack(): LocalProviderPack {
  return {
    providerId: "local",
    ports: createLocalPlatformPorts(),
    bindings: [
      {
        bindingId: "local.postgresql",
        service: "postgresql",
        provider: "local",
        classification: "confidential",
        profile: "ephemeral-dev",
      },
      {
        bindingId: "local.rabbitmq",
        service: "rabbitmq",
        provider: "local",
        classification: "internal",
        profile: "ephemeral-dev",
      },
      {
        bindingId: "local.object-storage",
        service: "object-storage",
        provider: "local",
        classification: "confidential",
        profile: "ephemeral-dev",
      },
    ],
  };
}
