"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  FilePlus,
  FolderPlus,
  Upload,
  Download,
  Loader2,
  FolderOpen,
  RefreshCw,
  Shield,
  PackageOpen,
  Archive,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { FileTree } from "@/components/files/FileTree";
import { FileEditor } from "@/components/files/FileEditor";
import { UploadDropzone } from "@/components/files/UploadDropzone";
import { fetchAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRefreshAnimation, refreshIconClassName } from "@/hooks/useRefreshAnimation";
import type { FileNode, Project } from "@vexlyx/shared";

// ---------------------------------------------------------------------------
// Standalone Full-Screen File Manager Page
// ---------------------------------------------------------------------------

export default function StandaloneFileManagerPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = params.id;
  const initialOpen = searchParams.get("open");

  const [project, setProject] = useState<Project | null>(null);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [currentDirPath, setCurrentDirPath] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Dialog states
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newDirOpen, setNewDirOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [chmodOpen, setChmodOpen] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [compressOpen, setCompressOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nodeToAct, setNodeToAct] = useState<FileNode | null>(null);
  // chmod state
  const [chmodMode, setChmodMode] = useState("644");
  const [chmodRecursive, setChmodRecursive] = useState(false);
  // compress state
  const [compressName, setCompressName] = useState("");

  // Fetch project metadata for top bar
  useEffect(() => {
    fetchAPI<Project>(`/api/projects/${projectId}`)
      .then((data) => setProject(data))
      .catch(() => undefined);
  }, [projectId]);

  // Handle ?open=... search param on initial mount
  useEffect(() => {
    if (initialOpen) {
      const parts = initialOpen.split("/");
      const name = parts[parts.length - 1] || initialOpen;
      const ext = name.includes(".") ? name.split(".").pop() : undefined;
      setSelectedNode({
        name,
        path: initialOpen,
        type: "file",
        extension: ext,
      });
      parts.pop();
      setCurrentDirPath(parts.join("/"));
    }
  }, [initialOpen]);

  const refreshTree = useCallback(() => setRefreshTrigger((t) => t + 1), []);

  const { isRefreshing, refresh } = useRefreshAnimation();
  const handleRefreshClick = () => refresh(async () => setRefreshTrigger((t) => t + 1));

  // ── Select node ──────────────────────────────────────────────────────────

  const handleSelect = (node: FileNode) => {
    setSelectedNode(node);
    if (node.type === "dir") {
      setCurrentDirPath(node.path);
    } else {
      const parts = node.path.split("/");
      parts.pop();
      setCurrentDirPath(parts.join("/"));
    }
  };

  // ── Create file ──────────────────────────────────────────────────────────

  const handleCreateFile = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      const cleanDir = currentDirPath ? currentDirPath.replace(/^[/\\]+|[/\\]+$/g, "") : "";
      const cleanName = trimmed.replace(/^[/\\]+/, "");
      const relPath = cleanDir ? `${cleanDir}/${cleanName}` : cleanName;

      await fetchAPI(`/api/files/${projectId}/create`, {
        method: "POST",
        body: JSON.stringify({ path: relPath, content: "" }),
      });
      toast.success(`Created ${cleanName}`);
      refreshTree();
      setNewFileOpen(false);
      setNewName("");
      // Select the newly created file
      setSelectedNode({
        name: cleanName,
        path: relPath,
        type: "file",
        extension: cleanName.includes(".") ? cleanName.split(".").pop() : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create file");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Create dir ───────────────────────────────────────────────────────────

  const handleCreateDir = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      const cleanDir = currentDirPath ? currentDirPath.replace(/^[/\\]+|[/\\]+$/g, "") : "";
      const cleanName = trimmed.replace(/^[/\\]+/, "");
      const relPath = cleanDir ? `${cleanDir}/${cleanName}` : cleanName;

      await fetchAPI(`/api/files/${projectId}/mkdir`, {
        method: "POST",
        body: JSON.stringify({ path: relPath }),
      });
      toast.success(`Created folder ${cleanName}`);
      refreshTree();
      setNewDirOpen(false);
      setNewName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Rename ───────────────────────────────────────────────────────────────

  const openRename = (node: FileNode) => {
    setNodeToAct(node);
    setNewName(node.name);
    setRenameOpen(true);
  };

  const handleRename = async () => {
    if (!nodeToAct || !newName.trim()) return;
    setIsSubmitting(true);
    try {
      const parts = nodeToAct.path.split("/");
      parts[parts.length - 1] = newName.trim();
      const newPath = parts.join("/");
      await fetchAPI(`/api/files/${projectId}/rename`, {
        method: "POST",
        body: JSON.stringify({ from: nodeToAct.path, to: newPath }),
      });
      toast.success("Renamed successfully");
      if (selectedNode?.path === nodeToAct.path) {
        setSelectedNode({
          ...selectedNode,
          name: newName.trim(),
          path: newPath,
          extension: newName.includes(".") ? newName.split(".").pop() : undefined,
        });
      }
      refreshTree();
      setRenameOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const openDelete = (node: FileNode) => {
    setNodeToAct(node);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!nodeToAct) return;
    setIsSubmitting(true);
    try {
      await fetchAPI(`/api/files/${projectId}/delete`, {
        method: "DELETE",
        body: JSON.stringify({ path: nodeToAct.path }),
      });
      toast.success(`Deleted ${nodeToAct.name}`);
      if (selectedNode?.path === nodeToAct.path) setSelectedNode(null);
      refreshTree();
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Chmod ─────────────────────────────────────────────────────────────────

  const openChmod = (node: FileNode) => {
    setNodeToAct(node);
    setChmodMode("644");
    setChmodRecursive(false);
    setChmodOpen(true);
  };

  const handleChmod = async () => {
    if (!nodeToAct || !/^[0-7]{3,4}$/.test(chmodMode)) return;
    setIsSubmitting(true);
    try {
      await fetchAPI(`/api/files/${projectId}/chmod`, {
        method: "POST",
        body: JSON.stringify({ path: nodeToAct.path, mode: chmodMode, recursive: chmodRecursive }),
      });
      toast.success(`Permissions set to ${chmodMode}`);
      setChmodOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change permissions");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Extract ───────────────────────────────────────────────────────────────

  const handleExtract = async () => {
    if (!nodeToAct) return;
    setIsSubmitting(true);
    try {
      await fetchAPI(`/api/files/${projectId}/extract`, {
        method: "POST",
        body: JSON.stringify({ path: nodeToAct.path, destPath: currentDirPath }),
      });
      toast.success("Archive extracted successfully");
      refreshTree();
      setExtractOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extract archive");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Compress ──────────────────────────────────────────────────────────────

  const handleCompress = async () => {
    if (!nodeToAct || !compressName.trim()) return;
    setIsSubmitting(true);
    try {
      const cleanName = compressName.trim().endsWith(".zip")
        ? compressName.trim()
        : `${compressName.trim()}.zip`;
      const cleanDir = currentDirPath ? `${currentDirPath}/` : "";
      const destPath = `${cleanDir}${cleanName}`;
      await fetchAPI(`/api/files/${projectId}/compress`, {
        method: "POST",
        body: JSON.stringify({ paths: [nodeToAct.path], destPath }),
      });
      toast.success(`Compressed to ${cleanName}`);
      refreshTree();
      setCompressOpen(false);
      setCompressName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to compress");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Download ─────────────────────────────────────────────────────────────

  const handleDownload = () => {
    if (!selectedNode || selectedNode.type === "dir") return;
    const url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/files/${projectId}/download?path=${encodeURIComponent(selectedNode.path)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedNode.name;
    a.click();
  };

  // ── Breadcrumbs ──────────────────────────────────────────────────────────

  const breadcrumbParts = currentDirPath ? currentDirPath.split("/").filter(Boolean) : [];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background select-none">
      {/* ── Top App Bar ──────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 bg-card/90 backdrop-blur-sm shrink-0 z-10">
        {/* Left: Branding & Project context */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/projects/${projectId}`}
            className="flex items-center gap-2 group hover:opacity-80 transition-opacity"
            title="Return to project panel"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs shadow-sm">
              V
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-foreground leading-tight flex items-center gap-1.5">
                {project?.name || "Vexlyx"}
                {project?.type && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 uppercase">
                    {project.type}
                  </Badge>
                )}
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <FolderOpen className="h-3 w-3" /> File Manager
              </span>
            </div>
          </Link>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            <button
              className="hover:text-foreground px-1 py-0.5 rounded hover:bg-muted transition-colors font-mono"
              onClick={() => { setCurrentDirPath(""); setSelectedNode(null); }}
              title="Root directory"
            >
              /
            </button>
            {breadcrumbParts.map((part, i) => {
              const fullSubPath = breadcrumbParts.slice(0, i + 1).join("/");
              const isLast = i === breadcrumbParts.length - 1;
              return (
                <span key={i} className="flex items-center gap-1 font-mono">
                  <span className="text-muted-foreground/40">/</span>
                  <button
                    className={cn(
                      "px-1 py-0.5 rounded hover:bg-muted transition-colors truncate max-w-[140px]",
                      isLast ? "text-foreground font-medium bg-muted/50" : "hover:text-foreground",
                    )}
                    onClick={() => {
                      setCurrentDirPath(fullSubPath);
                      setSelectedNode({
                        name: part,
                        path: fullSubPath,
                        type: "dir",
                      });
                    }}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        {/* Right: Actions & Tools */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            id="fm-new-file-btn"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-xs"
            onClick={() => { setNewName(""); setNewFileOpen(true); }}
          >
            <FilePlus className="h-3.5 w-3.5 text-indigo-500" />
            New File
          </Button>

          <Button
            id="fm-new-folder-btn"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-xs"
            onClick={() => { setNewName(""); setNewDirOpen(true); }}
          >
            <FolderPlus className="h-3.5 w-3.5 text-amber-500" />
            New Folder
          </Button>

          <Button
            id="fm-upload-btn"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-xs"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="h-3.5 w-3.5 text-emerald-500" />
            Upload
          </Button>

          {selectedNode?.type === "file" && (
            <Button
              id="fm-download-btn"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs shadow-xs"
              onClick={handleDownload}
            >
              <Download className="h-3.5 w-3.5 text-sky-500" />
              Download
            </Button>
          )}

          {selectedNode && isArchive(selectedNode.name) && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs shadow-xs"
              onClick={() => { setNodeToAct(selectedNode); setExtractOpen(true); }}
            >
              <PackageOpen className="h-3.5 w-3.5 text-violet-500" />
              Extract
            </Button>
          )}

          {selectedNode && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs shadow-xs"
              onClick={() => { setCompressName(selectedNode.name); setNodeToAct(selectedNode); setCompressOpen(true); }}
            >
              <Archive className="h-3.5 w-3.5 text-orange-500" />
              Compress
            </Button>
          )}

          {selectedNode && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs shadow-xs"
              onClick={() => openChmod(selectedNode)}
            >
              <Shield className="h-3.5 w-3.5 text-rose-500" />
              Permissions
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => void handleRefreshClick()}
            disabled={isRefreshing}
            title="Refresh tree"
            aria-label="Refresh files"
          >
            <RefreshCw className={refreshIconClassName(isRefreshing, "h-3.5 w-3.5")} />
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <ThemeToggle />

          <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1">
            <Link href={`/projects/${projectId}`} title="Return to project details">
              <ArrowLeft className="h-3.5 w-3.5" />
              Exit
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Main Workspace: Two-Pane Layout ─────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: Directory Tree */}
        <aside className="w-72 md:w-80 border-r border-border bg-card/40 flex flex-col shrink-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto py-2">
            <FileTree
              projectId={projectId}
              selectedPath={selectedNode?.path}
              onSelect={handleSelect}
              onDelete={openDelete}
              onRename={openRename}
              refreshTrigger={refreshTrigger}
            />
          </div>
        </aside>

        {/* Right Pane: Code Editor / Empty State */}
        <main className="flex-1 overflow-hidden bg-background flex flex-col">
          {selectedNode?.type === "file" ? (
            <FileEditor
              projectId={projectId}
              filePath={selectedNode.path}
              extension={selectedNode.extension}
              className="h-full flex-1"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-4 text-muted-foreground shadow-xs">
                <FolderOpen className="h-7 w-7 text-amber-500/80" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {selectedNode?.type === "dir" ? selectedNode.name : "Select a file to edit"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {selectedNode?.type === "dir"
                  ? `Viewing directory: /${selectedNode.path}. Select a file from the tree to edit.`
                  : "Choose any file from the tree on the left, or use the quick actions below."}
              </p>

              <div className="flex items-center gap-3 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs"
                  onClick={() => { setNewName(""); setNewFileOpen(true); }}
                >
                  <FilePlus className="h-3.5 w-3.5 text-indigo-500" />
                  New File
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs"
                  onClick={() => { setNewName(""); setNewDirOpen(true); }}
                >
                  <FolderPlus className="h-3.5 w-3.5 text-amber-500" />
                  New Folder
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs"
                  onClick={() => setUploadOpen(true)}
                >
                  <Upload className="h-3.5 w-3.5 text-emerald-500" />
                  Upload
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}

      {/* New File dialog */}
      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
            <DialogDescription>
              Create a new empty file in{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                /{currentDirPath || ""}
              </code>
            </DialogDescription>
          </DialogHeader>
          <Input
            id="new-file-name-input"
            placeholder="e.g. index.php, styles.css, script.js"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreateFile(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFileOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreateFile()} disabled={isSubmitting || !newName.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder dialog */}
      <Dialog open={newDirOpen} onOpenChange={setNewDirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>
              Create a new directory in{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                /{currentDirPath || ""}
              </code>
            </DialogDescription>
          </DialogHeader>
          <Input
            id="new-folder-name-input"
            placeholder="e.g. assets, plugins, uploads"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreateDir(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDirOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreateDir()} disabled={isSubmitting || !newName.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              Enter a new name for &ldquo;{nodeToAct?.name}&rdquo;
            </DialogDescription>
          </DialogHeader>
          <Input
            id="rename-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleRename(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleRename()} disabled={isSubmitting || !newName.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{nodeToAct?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              This will permanently delete the {nodeToAct?.type === "dir" ? "folder and all its contents" : "file"}.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              id="confirm-delete-file-btn"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
            <DialogDescription>
              Files will be uploaded into{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                /{currentDirPath || ""}
              </code>
            </DialogDescription>
          </DialogHeader>
          <UploadDropzone
            projectId={projectId}
            targetPath={currentDirPath}
            onUploadComplete={() => { refreshTree(); setUploadOpen(false); }}
          />
        </DialogContent>
      </Dialog>

      {/* Permissions (chmod) dialog */}
      <Dialog open={chmodOpen} onOpenChange={setChmodOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Permissions</DialogTitle>
            <DialogDescription>
              Set UNIX permissions for{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                {nodeToAct?.name}
              </code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Octal mode</label>
              <Input
                placeholder="644"
                value={chmodMode}
                onChange={(e) => setChmodMode(e.target.value.replace(/[^0-7]/g, "").slice(0, 4))}
                className="font-mono"
                maxLength={4}
              />
              <p className="text-xs text-muted-foreground">
                Common values: 644 (files), 755 (dirs/executables), 600 (private), 777 (world-writable)
              </p>
            </div>
            {nodeToAct?.type === "dir" && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={chmodRecursive}
                  onChange={(e) => setChmodRecursive(e.target.checked)}
                  className="rounded"
                />
                Apply to all contents recursively
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChmodOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void handleChmod()}
              disabled={isSubmitting || !/^[0-7]{3,4}$/.test(chmodMode)}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extract archive dialog */}
      <Dialog open={extractOpen} onOpenChange={setExtractOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Extract Archive</DialogTitle>
            <DialogDescription>
              Extract{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                {nodeToAct?.name}
              </code>{" "}
              into the current directory.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtractOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleExtract()} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Extract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compress dialog */}
      <Dialog open={compressOpen} onOpenChange={setCompressOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Compress to ZIP</DialogTitle>
            <DialogDescription>
              Create a ZIP archive containing{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                {nodeToAct?.name}
              </code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Archive name</label>
            <Input
              placeholder="archive.zip"
              value={compressName}
              onChange={(e) => setCompressName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCompress(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompressOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCompress()} disabled={isSubmitting || !compressName.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Compress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isArchive(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith(".zip") ||
    lower.endsWith(".tar.gz") ||
    lower.endsWith(".tgz") ||
    lower.endsWith(".tar.bz2") ||
    lower.endsWith(".tar")
  );
}
