import { describe, it, expect, vi, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mockEnv = vi.hoisted(() => ({ PYTHON_BIN: undefined as string | undefined }));
vi.mock("../config/env.js", () => ({ env: mockEnv }));

const { getPythonBin } = await import("./pythonBin.js");

afterEach(() => {
  mockEnv.PYTHON_BIN = undefined;
  vi.unstubAllGlobals();
});

describe("getPythonBin", () => {
  it("uses the validated PYTHON_BIN setting when present", () => {
    mockEnv.PYTHON_BIN = "/opt/vexlyx/venv/bin/python";
    expect(getPythonBin()).toBe("/opt/vexlyx/venv/bin/python");
  });

  it("falls back to python3 on non-Windows hosts", () => {
    const original = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "linux" });
    try {
      expect(getPythonBin()).toBe("python3");
    } finally {
      Object.defineProperty(process, "platform", original);
    }
  });

  it("falls back to python on Windows hosts", () => {
    const original = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      expect(getPythonBin()).toBe("python");
    } finally {
      Object.defineProperty(process, "platform", original);
    }
  });
});

// Regression guard for #53: every Python script must be launched through
// getPythonBin(), otherwise a host whose interpreter is `python3` (stock Linux)
// or a custom PYTHON_BIN breaks only that one feature, confusingly.
describe("no module bypasses getPythonBin()", () => {
  const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
    });
  }

  const files = sourceFiles(srcRoot).filter(
    (file) => !file.endsWith(join("utils", "pythonBin.ts")),
  );

  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("never spawns a hardcoded python interpreter", () => {
    const offenders = files.filter((file) =>
      /\b(spawn|execFile|exec|spawnSync|execFileSync)\(\s*["'`]python3?["'`]/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders.map((file) => relative(srcRoot, file))).toEqual([]);
  });

  it("never reads PYTHON_BIN outside the shared helper", () => {
    const offenders = files.filter((file) =>
      /\b(process\.)?env\.PYTHON_BIN\b/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((file) => relative(srcRoot, file))).toEqual([]);
  });
});
