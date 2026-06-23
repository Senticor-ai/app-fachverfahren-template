export async function enableMocking(): Promise<void> {
  if (
    !import.meta.env.DEV ||
    import.meta.env["VITE_API_MOCKING"] === "disabled"
  ) {
    return;
  }

  const { worker } = await import("./browser.js");
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: {
      url: "/mockServiceWorker.js",
    },
  });
}
