import { execFile } from "node:child_process";

interface RunCheckedOptions {
  cwd?: string;
  dryRun?: boolean;
}

interface CommandError extends Error {
  code?: number | string;
}

export function runChecked(
  command: string,
  args: string[],
  options: RunCheckedOptions = {},
) {
  const { cwd = process.cwd(), dryRun = false } = options;
  if (dryRun) {
    return Promise.resolve({
      command,
      args,
      cwd,
      skipped: true,
    });
  }

  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      cwd,
      env: process.env,
      maxBuffer: 30 * 1024 * 1024,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ command, args, cwd, code });
      } else {
        const error: CommandError = new Error(
          `${command} ${args.join(" ")} exited ${code}`,
        );
        error.code = code;
        reject(error);
      }
    });
  });
}
