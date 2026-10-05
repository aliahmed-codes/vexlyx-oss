# Projects API

All endpoints prefixed with `/api/projects`. Auth required.

## GET /

List projects for the authenticated user.

**Query:**
- `page` (number, default 1)
- `limit` (number, default 20)
- `status` (filter by `ProjectStatus`)
- `type` (filter by `ProjectType`)

---

## POST /

Create a new project.

**Body:**
```json
{
  "name": "my-app",
  "type": "NEXTJS",
  "gitUrl": "https://github.com/user/repo",
  "branch": "main",
  "buildCmd": null,
  "startCmd": null,
  "port": null
}
```

---

## GET /:id

Get a single project by ID.

---

## PATCH /:id

Update project settings.

---

## DELETE /:id

Soft-delete a project (stops containers, removes workspace).

---

## POST /:id/deploy

Trigger a deployment. Queues a BullMQ job.

**Body:**
```json
{ "commitHash": "abc123", "commitMsg": "feat: update homepage" }
```

---

## POST /:id/action

Control the running container.

**Body:**
```json
{ "action": "start" | "stop" | "restart" }
```

---

## GET /:id/env

List environment variables (values masked).

---

## POST /:id/env

Create or update an environment variable.

**Body:**
```json
{ "key": "DATABASE_URL", "value": "postgresql://..." }
```

---

## DELETE /:id/env/:envId

Delete an environment variable.
