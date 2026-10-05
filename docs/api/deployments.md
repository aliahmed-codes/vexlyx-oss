# Deployments API

All endpoints prefixed with `/api/deployments`. Auth required.

## GET /

List deployments for the authenticated user (across all projects).

**Query:** `page`, `limit`, `projectId`, `status`

---

## GET /:id

Get a single deployment.

---

## GET /:id/logs

Stream deployment build logs (Server-Sent Events).

---

## POST /:id/cancel

Cancel a queued or building deployment.
