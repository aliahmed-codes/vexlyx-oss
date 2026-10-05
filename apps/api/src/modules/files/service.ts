import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import type { PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import { safePath } from "./schema.js";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class FileError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "FileError";
  }
}

// ---------------------------------------------------------------------------
// File node shape
// ---------------------------------------------------------------------------

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  mtime?: string;
  extension?: string;
  children?: FileNode[];
}

// ---------------------------------------------------------------------------
// Max readable file size (2 MB)
// ---------------------------------------------------------------------------

const MAX_READ_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FileService {
  constructor(private prisma: PrismaClient) { }

  // ── Security: resolve + guard ──────────────────────────────────────────

  private async resolveAndGuard(
    userId: string,
    projectId: string,
    relPath: string,
    forWrite = false,
  ): Promise<string> {
    // Verify ownership
    await this.findOwnedProject(userId, projectId);

    const sanitized = safePath(relPath, forWrite);
    const projectRoot = path.resolve(env.PROJECTS_DIR, projectId);
    const target = path.resolve(projectRoot, sanitized);

    // After resolve: must still be inside project root
    if (!target.startsWith(projectRoot + path.sep) && target !== projectRoot) {
      throw new FileError("Path escapes project root", "PATH_TRAVERSAL", 403);
    }

    // Follow symlinks and verify the real path stays inside root
    try {
      const real = await fs.realpath(target);
      if (!real.startsWith(projectRoot + path.sep) && real !== projectRoot) {
        throw new FileError("Symlink escapes project root", "SYMLINK_ESCAPE", 403);
      }
    } catch (err) {
      // realpath throws ENOENT for non-existent paths (ok for create ops)
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") throw err;
    }

    return target;
  }

  private projectRoot(projectId: string): string {
    return path.resolve(env.PROJECTS_DIR, projectId);
  }

  // ── List directory ─────────────────────────────────────────────────────

  async listDir(
    userId: string,
    projectId: string,
    relPath: string,
    depth = 1,
  ): Promise<FileNode[]> {
    const target = await this.resolveAndGuard(userId, projectId, relPath || "");
    return this.readDirRecursive(
      target,
      this.projectRoot(projectId),
      depth,
    );
  }

  private async readDirRecursive(
    absDir: string,
    rootDir: string,
    depth: number,
  ): Promise<FileNode[]> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      throw new FileError("Directory not found or not accessible", "DIR_NOT_FOUND", 404);
    }

    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      const rel = path.relative(rootDir, abs).replace(/\\/g, "/");
      const isDir = entry.isDirectory();

      const node: FileNode = {
        name: entry.name,
        path: rel,
        type: isDir ? "dir" : "file",
      };

      if (!isDir) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (ext) node.extension = ext;
        try {
          const stat = await fs.stat(abs);
          node.size = stat.size;
          node.mtime = stat.mtime.toISOString();
        } catch {
          // skip stat on error
        }
      }

      if (isDir && depth > 1) {
        node.children = await this.readDirRecursive(abs, rootDir, depth - 1);
      }

      nodes.push(node);
    }

    // Dirs first, then files, alphabetical within each group
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return nodes;
  }

  // ── Read file ──────────────────────────────────────────────────────────

  async readFile(
    userId: string,
    projectId: string,
    relPath: string,
  ): Promise<string> {
    const target = await this.resolveAndGuard(userId, projectId, relPath);

    const stat = await fs.stat(target).catch(() => {
      throw new FileError("File not found", "FILE_NOT_FOUND", 404);
    });

    if (stat.isDirectory()) {
      throw new FileError("Path is a directory, not a file", "IS_DIRECTORY", 400);
    }

    if (stat.size > MAX_READ_BYTES) {
      throw new FileError(
        `File is too large to edit in browser (max ${MAX_READ_BYTES / 1024 / 1024} MB)`,
        "FILE_TOO_LARGE",
        413,
      );
    }

    const content = await fs.readFile(target, "utf-8");
    return content;
  }

  // ── Create file (never overwrites) ──────────────────────────────────────

  async createFile(
    userId: string,
    projectId: string,
    relPath: string,
    content = "",
  ): Promise<void> {
    const target = await this.resolveAndGuard(userId, projectId, relPath, true);

    const exists = await fs
      .lstat(target)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      throw new FileError(
        `A file or folder named "${path.posix.basename(relPath)}" already exists`,
        "FILE_ALREADY_EXISTS",
        409,
      );
    }

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Atomic write via temp file
    const tmp = `${target}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, content, "utf-8");
    await fs.rename(tmp, target);
  }

  // ── Write file ─────────────────────────────────────────────────────────

  async writeFile(
    userId: string,
    projectId: string,
    relPath: string,
    content: string,
    createOnly = false,
  ): Promise<void> {
    const target = await this.resolveAndGuard(userId, projectId, relPath, true);

    const stat = await fs.lstat(target).catch(() => null);
    if (stat) {
      if (stat.isDirectory()) {
        throw new FileError(
          `Cannot overwrite directory "${path.posix.basename(relPath)}" with a file`,
          "IS_DIRECTORY",
          400,
        );
      }
      if (createOnly) {
        throw new FileError(
          `A file or folder named "${path.posix.basename(relPath)}" already exists`,
          "FILE_ALREADY_EXISTS",
          409,
        );
      }
    }

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Atomic write via temp file
    const tmp = `${target}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, content, "utf-8");
    await fs.rename(tmp, target);
  }

  // ── Delete ─────────────────────────────────────────────────────────────

  async deleteNode(
    userId: string,
    projectId: string,
    relPath: string,
  ): Promise<void> {
    const target = await this.resolveAndGuard(userId, projectId, relPath, true);
    const root = this.projectRoot(projectId);

    // Never allow deleting the project root itself
    if (target === root) {
      throw new FileError("Cannot delete project root", "DELETE_ROOT", 400);
    }

    await fs.rm(target, { recursive: true, force: true });
  }

  // ── Rename ─────────────────────────────────────────────────────────────

  async rename(
    userId: string,
    projectId: string,
    fromRel: string,
    toRel: string,
  ): Promise<void> {
    const from = await this.resolveAndGuard(userId, projectId, fromRel, true);
    const to = await this.resolveAndGuard(userId, projectId, toRel, true);

    await fs.stat(from).catch(() => {
      throw new FileError("Source file not found", "SOURCE_NOT_FOUND", 404);
    });

    const destExists = await fs.lstat(to).then(() => true).catch(() => false);
    if (destExists) {
      throw new FileError(
        `A file or folder named "${path.posix.basename(toRel)}" already exists`,
        "DESTINATION_ALREADY_EXISTS",
        409,
      );
    }

    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.rename(from, to);
  }

  // ── Mkdir ──────────────────────────────────────────────────────────────

  async mkdir(
    userId: string,
    projectId: string,
    relPath: string,
  ): Promise<void> {
    const target = await this.resolveAndGuard(userId, projectId, relPath, true);
    const exists = await fs
      .lstat(target)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      throw new FileError(
        `A file or folder named "${path.posix.basename(relPath)}" already exists`,
        "DIRECTORY_ALREADY_EXISTS",
        409,
      );
    }
    await fs.mkdir(target, { recursive: true });
  }

  // ── Copy ───────────────────────────────────────────────────────────────

  async copy(
    userId: string,
    projectId: string,
    fromRel: string,
    toRel: string,
  ): Promise<void> {
    const from = await this.resolveAndGuard(userId, projectId, fromRel);
    const to = await this.resolveAndGuard(userId, projectId, toRel, true);

    const stat = await fs.stat(from).catch(() => {
      throw new FileError("Source not found", "SOURCE_NOT_FOUND", 404);
    });

    const destExists = await fs.stat(to).then(() => true).catch(() => false);
    if (destExists) {
      throw new FileError(
        `Destination "${path.posix.basename(toRel)}" already exists`,
        "DESTINATION_ALREADY_EXISTS",
        409,
      );
    }

    await fs.mkdir(path.dirname(to), { recursive: true });

    if (stat.isDirectory()) {
      await fs.cp(from, to, { recursive: true });
    } else {
      await fs.copyFile(from, to);
    }
  }

  // ── Move ───────────────────────────────────────────────────────────────

  async move(
    userId: string,
    projectId: string,
    fromRel: string,
    toRel: string,
  ): Promise<void> {
    const from = await this.resolveAndGuard(userId, projectId, fromRel, true);
    const to = await this.resolveAndGuard(userId, projectId, toRel, true);

    await fs.stat(from).catch(() => {
      throw new FileError("Source not found", "SOURCE_NOT_FOUND", 404);
    });

    const destExists = await fs.stat(to).then(() => true).catch(() => false);
    if (destExists) {
      throw new FileError(
        `Destination "${path.posix.basename(toRel)}" already exists`,
        "DESTINATION_ALREADY_EXISTS",
        409,
      );
    }

    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
      await fs.rename(from, to);
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "EXDEV") {
        await this.copy(userId, projectId, fromRel, toRel);
        await this.deleteNode(userId, projectId, fromRel);
      } else {
        throw err;
      }
    }
  }

  // ── Download (stream) ──────────────────────────────────────────────────

  async getDownloadStream(
    userId: string,
    projectId: string,
    relPath: string,
  ): Promise<{ stream: ReturnType<typeof createReadStream>; filename: string; size: number }> {
    const target = await this.resolveAndGuard(userId, projectId, relPath);

    const stat = await fs.stat(target).catch(() => {
      throw new FileError("File not found", "FILE_NOT_FOUND", 404);
    });

    if (stat.isDirectory()) {
      throw new FileError("Cannot download a directory directly, use export instead", "IS_DIRECTORY", 400);
    }

    return {
      stream: createReadStream(target),
      filename: path.basename(target),
      size: stat.size,
    };
  }

  // ── Upload (write stream) ──────────────────────────────────────────────

  async writeUploadStream(
    userId: string,
    projectId: string,
    relPath: string,
    readableStream: NodeJS.ReadableStream,
    overwrite = false,
  ): Promise<void> {
    const target = await this.resolveAndGuard(userId, projectId, relPath, true);

    const exists = await fs.lstat(target).then(() => true).catch(() => false);
    if (exists && !overwrite) {
      throw new FileError(
        `A file or folder named "${path.posix.basename(relPath)}" already exists`,
        "FILE_ALREADY_EXISTS",
        409,
      );
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    const ws = createWriteStream(target);
    await pipeline(readableStream, ws);
  }

  // ── Chmod (F5.24) ──────────────────────────────────────────────────────

  async chmod(
    userId: string,
    projectId: string,
    relPath: string,
    mode: string,
    recursive: boolean,
  ): Promise<void> {
    const target = await this.resolveAndGuard(userId, projectId, relPath, true);
    const root = this.projectRoot(projectId);

    if (target === root) {
      throw new FileError("Cannot chmod the project root", "CHMOD_ROOT", 400);
    }

    const modeInt = parseInt(mode.replace(/^0/, ""), 8);

    await fs.chmod(target, modeInt);

    if (recursive) {
      const stat = await fs.stat(target).catch(() => null);
      if (stat?.isDirectory()) {
        await this.chmodRecursive(target, modeInt);
      }
    }
  }

  private async chmodRecursive(dir: string, mode: number): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      await fs.chmod(abs, mode).catch(() => undefined);
      if (entry.isDirectory()) {
        await this.chmodRecursive(abs, mode);
      }
    }
  }

  // ── Extract archive (F5.24) ────────────────────────────────────────────

  async extract(
    userId: string,
    projectId: string,
    archiveRelPath: string,
    destRelPath: string,
  ): Promise<void> {
    const archivePath = await this.resolveAndGuard(userId, projectId, archiveRelPath);
    const root = this.projectRoot(projectId);

    const destAbs = destRelPath
      ? await this.resolveAndGuard(userId, projectId, destRelPath, true)
      : path.dirname(archivePath);

    await fs.mkdir(destAbs, { recursive: true });

    const lowerName = archiveRelPath.toLowerCase();
    let cmd: string;
    let args: string[];

    if (lowerName.endsWith(".zip")) {
      cmd = "unzip";
      args = ["-o", archivePath, "-d", destAbs];
    } else if (lowerName.endsWith(".tar.gz") || lowerName.endsWith(".tgz")) {
      cmd = "tar";
      args = ["-xzf", archivePath, "-C", destAbs];
    } else if (lowerName.endsWith(".tar.bz2")) {
      cmd = "tar";
      args = ["-xjf", archivePath, "-C", destAbs];
    } else if (lowerName.endsWith(".tar")) {
      cmd = "tar";
      args = ["-xf", archivePath, "-C", destAbs];
    } else {
      throw new FileError(
        "Unsupported archive format. Supported: .zip, .tar, .tar.gz, .tgz, .tar.bz2",
        "UNSUPPORTED_ARCHIVE",
        400,
      );
    }

    await runCommand(cmd, args, root);
  }

  // ── Compress to zip (F5.24) ────────────────────────────────────────────

  async compress(
    userId: string,
    projectId: string,
    relPaths: string[],
    destRelPath: string,
  ): Promise<void> {
    const root = this.projectRoot(projectId);

    const absPaths = await Promise.all(
      relPaths.map((p) => this.resolveAndGuard(userId, projectId, p)),
    );

    const destAbs = await this.resolveAndGuard(userId, projectId, destRelPath, true);

    if (!destRelPath.toLowerCase().endsWith(".zip")) {
      throw new FileError("Destination must have a .zip extension", "INVALID_EXTENSION", 400);
    }

    const relativeEntries = absPaths.map((abs) => path.relative(root, abs));
    await runCommand("zip", ["-r", destAbs, ...relativeEntries], root);
  }

  // ── Ownership guard ────────────────────────────────────────────────────

  private async findOwnedProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, deletedAt: true },
    });

    if (!project || project.deletedAt !== null) {
      throw new FileError("Project not found", "PROJECT_NOT_FOUND", 404);
    }

    if (project.userId !== userId) {
      throw new FileError("You do not have access to this project", "FORBIDDEN", 403);
    }

    return project;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new FileError(
          `Command '${cmd}' failed: ${stderr.trim() || "non-zero exit"}`,
          "COMMAND_FAILED",
          500,
        ));
      } else {
        resolve();
      }
    });
    proc.on("error", (err) => {
      reject(new FileError(
        `Failed to start '${cmd}': ${err.message}`,
        "COMMAND_NOT_FOUND",
        500,
      ));
    });
  });
}
