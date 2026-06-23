export function writeReport(report, { json = false } = {}) {
  if (json) {
    console.log(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  console.log(formatMarkdownReport(report));
}

export function formatMarkdownReport(report) {
  const lines = [`# ${report.title}`, "", `Status: ${report.status}`, ""];

  if (report.summary) {
    lines.push(report.summary, "");
  }

  for (const section of report.sections ?? []) {
    lines.push(`## ${section.title}`, "");
    if (section.items?.length) {
      for (const item of section.items) {
        lines.push(`- ${item}`);
      }
    } else {
      lines.push("Keine Einträge.");
    }
    lines.push("");
  }

  return lines.join("\n");
}
