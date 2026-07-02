(function () {
  if (window.parent === window) return;
  function post(kind, detail) {
    try {
      window.parent.postMessage(
        {
          source: "chos-app",
          kind: kind,
          detail: detail,
          url: location.href,
          at: new Date().toISOString(),
        },
        "*",
      );
    } catch (_error) {}
  }
  window.addEventListener("error", function (event) {
    post("error", {
      message: event.message,
      stack: event.error && event.error.stack ? String(event.error.stack) : "",
      filename: event.filename,
      line: event.lineno,
      col: event.colno,
    });
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    post("unhandledrejection", {
      message: reason && reason.message ? reason.message : String(reason),
      stack: reason && reason.stack ? String(reason.stack) : "",
    });
  });
  var originalError = console.error.bind(console);
  console.error = function () {
    try {
      post("console.error", {
        message: Array.prototype.map.call(arguments, String).join(" "),
      });
    } catch (_error) {}
    return originalError.apply(null, arguments);
  };
  window.addEventListener("load", function () {
    setTimeout(function () {
      var root = document.getElementById("root");
      var empty =
        !root ||
        root.childElementCount === 0 ||
        (root.textContent || "").trim() === "";
      if (empty) {
        post("blank", {
          message:
            "App-Wurzel (#root) ist nach dem Laden leer - vermutlich Render-/Import-Fehler.",
          html: document.body ? document.body.innerHTML.slice(0, 600) : "",
        });
      }
    }, 6000);
  });
  post("ready", { message: "Fehler-Reporter aktiv" });
})();
