export async function enableMocking(): Promise<void> {
  if (
    !import.meta.env.DEV ||
    import.meta.env["VITE_API_MOCKING"] === "disabled"
  ) {
    return;
  }

  try {
    const { worker } = await import("./browser.js");
    await worker.start({
      onUnhandledRequest: "bypass",
      serviceWorker: {
        // BASE-BEWUSST: hinter dem CHOS-Preview-Proxy läuft die App unter /flow/preview/<session>/. Ein Service Worker
        // kann nur seinen EIGENEN Pfad-Scope kontrollieren — von "/" geladen (Root) scheitert die Registrierung im Proxy
        // → enableMocking wirft → App mountet nie → WEISSER SCHIRM. import.meta.env.BASE_URL ist "/" (standalone) bzw. der
        // Preview-Pfad; so wird der SW von /flow/preview/<session>/mockServiceWorker.js mit passendem Scope registriert.
        url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
      },
    });
  } catch (err) {
    // Mocking ist NICHT app-kritisch: scheitert die SW-Registrierung (Scope/HTTP/Browser), rendert die App TROTZDEM
    // (ohne Mocks) — nie weiß bleiben wegen der Test-Daten-Schicht.
    console.warn(
      "[mocking] Service Worker nicht registriert — App rendert ohne Mocks.",
      err,
    );
  }
}
