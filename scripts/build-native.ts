#!/usr/bin/env tsx
import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { writeError, writeMarkdownBlock, writeWarning } from "./markdown-output";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function findCargo(): string | null {
  const candidates: string[] = [
    process.env["CARGO"] ?? "",
    join(homedir(), ".cargo", "bin", "cargo"),
    join(homedir(), ".cargo", "bin", "cargo.exe"),
    "cargo",
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (c === "cargo") {
        execFileSync(c, ["--version"], { stdio: "ignore" });
        return c;
      }
      if (existsSync(c)) return c;
    } catch {}
  }
  return null;
}

const cargo = findCargo();
if (cargo == null) {
  writeWarning("Skipping Rust build", {
    reason: "cargo is not available on PATH.",
    install: "https://rustup.rs",
  });
  process.exit(0);
}

writeMarkdownBlock("Using cargo toolchain", { cargo });

const cargoDir = dirname(cargo);
const envWithCargo = {
  ...process.env,
  CARGO: cargo,
  PATH: `${cargoDir}${process.platform === "win32" ? ";" : ":"}${process.env["PATH"] ?? ""}`,
};

try {
  writeMarkdownBlock("Building Rust workspace", { exclude: "memory-sync-gui" });
  execSync("cargo build --release --workspace --exclude memory-sync-gui", {
    stdio: "inherit",
    cwd: root,
    env: envWithCargo,
  });
  writeMarkdownBlock("Rust build complete");
} catch {
  writeError("Rust build failed");
  process.exit(1);
}
