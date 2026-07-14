// App = die KOMPOSITION. Der Routen-Baum wird aus Deskriptoren abgeleitet; die Runtime-
// Konfiguration wird vor interaktiven Routen aufgelöst, damit Demo-Warnungen nie flackern.
import { Routes } from "react-router-dom";
import { buildAppRouteChildren } from "./app/build-routes.js";
import { FirstRunGate } from "./app/guards.js";
import { appRoutes } from "./app/routes.js";
import { personaFromPath } from "./app/shell.js";
import { useRuntimeConfig } from "./runtime-config.js";

export function App(): React.JSX.Element {
  const runtimeConfig = useRuntimeConfig();
  if (runtimeConfig.status === "loading") return <></>;
  return (
    <FirstRunGate>
      <Routes>{buildAppRouteChildren(appRoutes)}</Routes>
    </FirstRunGate>
  );
}

export { personaFromPath };
