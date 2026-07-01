import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface RunGitOptions {
  cwd?: string;
  allowFailure?: boolean;
}

interface TemplateError extends Error {
  code?: string;
  details?: string;
  stdout?: string;
  stderr?: string;
}

export async function runGit(args: string[], options: RunGitOptions = {}) {
  const { cwd = process.cwd(), allowFailure = false } = options;
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
    });
    return {
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    const gitError = error as TemplateError;
    if (allowFailure) {
      return {
        ok: false,
        stdout: gitError.stdout?.trim?.() ?? "",
        stderr: gitError.stderr?.trim?.() ?? gitError.message,
      };
    }
    throw error;
  }
}

export async function getGitCommit(cwd = process.cwd()) {
  const result = await runGit(["rev-parse", "HEAD"], {
    cwd,
    allowFailure: true,
  });
  return result.ok ? result.stdout : "working-tree";
}

export async function getGitShortStatus(cwd = process.cwd()) {
  const result = await runGit(["status", "--short"], {
    cwd,
    allowFailure: true,
  });
  return result.ok ? result.stdout : "";
}

export async function getGitDiffHash(cwd = process.cwd()) {
  const status = await getGitShortStatus(cwd);
  const unstaged = await runGit(["diff", "--binary"], {
    cwd,
    allowFailure: true,
  });
  const staged = await runGit(["diff", "--cached", "--binary"], {
    cwd,
    allowFailure: true,
  });
  if (!status && !unstaged.stdout && !staged.stdout) {
    return undefined;
  }
  return createHash("sha256")
    .update(status)
    .update("\n--- unstaged ---\n")
    .update(unstaged.stdout)
    .update("\n--- staged ---\n")
    .update(staged.stdout)
    .digest("hex");
}

export async function isWorktreeClean(cwd = process.cwd()) {
  return (await getGitShortStatus(cwd)) === "";
}

export async function assertCleanWorktree(cwd = process.cwd()) {
  const status = await getGitShortStatus(cwd);
  if (status !== "") {
    const error: TemplateError = new Error(
      "template update requires a clean Git worktree",
    );
    error.code = "DIRTY_WORKTREE";
    error.details = status;
    throw error;
  }
}

export async function isGitRefAvailable(ref: string, cwd = process.cwd()) {
  if (!ref) {
    return false;
  }
  const result = await runGit(["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd,
    allowFailure: true,
  });
  return result.ok;
}
