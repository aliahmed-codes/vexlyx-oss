# Databases API

All endpoints prefixed with `/api/databases`. Auth required.

## GET /

List databases for the authenticated user.

---

## POST /

Provision a new database.

**Body:**
```json
{ "name": "mydb", "type": "POSTGRESQL" }
```

---

## GET /:id

Get a single database with connection details.

---

## DELETE /:id

Drop the database and remove the user.

---

## POST /:id/reset-password

Generate a new random password for the database user.
