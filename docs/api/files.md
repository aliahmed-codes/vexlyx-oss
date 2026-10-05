# Files API

All endpoints prefixed with `/api/files/:id` where `:id` is the project ID. Auth required for all.

## GET /:id/list

List a directory.

**Query:**
- `path` (string, default `""`) — relative path inside the project
- `depth` (1–3, default `1`) — directory recursion depth

**Response `200`:**
```json
{
  "nodes": [
    { "name": "index.php", "path": "index.php", "type": "file", "size": 1234, "mtime": "...", "extension": "php" },
    { "name": "uploads", "path": "uploads", "type": "dir" }
  ]
}
```

---

## GET /:id/read

Read a file's text content (max 2 MB).

**Query:** `path` (string)

**Response `200`:**
```json
{ "content": "<?php echo 'hello'; ?>" }
```

---

## POST /:id/create

Create a new file (never overwrites).

**Body:**
```json
{ "path": "src/index.ts", "content": "" }
```

---

## POST /:id/write

Write/overwrite a file.

**Body:**
```json
{ "path": "src/index.ts", "content": "...", "createOnly": false }
```

---

## DELETE /:id/delete

Delete a file or directory (recursive).

**Body:**
```json
{ "path": "old-file.txt" }
```

---

## POST /:id/rename

Rename a file or directory.

**Body:**
```json
{ "from": "oldname.txt", "to": "newname.txt" }
```

---

## POST /:id/mkdir

Create a directory.

**Body:**
```json
{ "path": "src/components" }
```

---

## POST /:id/copy

Copy a file or directory.

**Body:**
```json
{ "from": "template.php", "to": "page.php" }
```

---

## POST /:id/move

Move a file or directory.

**Body:**
```json
{ "from": "src/foo.ts", "to": "lib/foo.ts" }
```

---

## GET /:id/download

Download a file as an attachment.

**Query:** `path` (string)

---

## POST /:id/upload

Upload one or more files (multipart/form-data).

**Fields:**
- `path` (text field) — destination directory (optional)
- file fields — the files to upload

---

## POST /:id/chmod

Change file/directory permissions. Uses `fs.promises.chmod`.

**Body:**
```json
{ "path": "storage", "mode": "755", "recursive": true }
```

- `mode` — 3–4 digit octal string (`644`, `755`, `0755`)
- `recursive` — apply to all contents (directories only)

---

## POST /:id/extract

Extract an archive (`.zip`, `.tar.gz`, `.tgz`, `.tar.bz2`, `.tar`).

**Body:**
```json
{ "path": "backup.zip", "destPath": "extracted/" }
```

- `destPath` — destination directory (default: same directory as archive)

---

## POST /:id/compress

Compress a file or directory into a ZIP archive.

**Body:**
```json
{ "paths": ["src", "public"], "destPath": "deploy.zip" }
```
