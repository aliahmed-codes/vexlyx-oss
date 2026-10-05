# Domains API

All endpoints prefixed with `/api/domains`. Auth required.

## GET /

List domains for the authenticated user.

---

## POST /

Add a custom domain.

**Body:**
```json
{ "name": "example.com", "projectId": "..." }
```

---

## GET /:id

Get a single domain.

---

## PATCH /:id

Update domain settings (e.g. `projectId`).

---

## DELETE /:id

Remove a domain.

---

## POST /:id/verify

Trigger DNS verification (checks for TXT record).

---

## GET /:id/dns

List DNS records. Returns `409 DNS_NOT_MANAGED` if `dnsMode === "CONNECTED"`.

---

## POST /:id/dns

Create a DNS record.

---

## PATCH /:id/dns/:recordId

Update a DNS record.

---

## DELETE /:id/dns/:recordId

Delete a DNS record.

---

## POST /:id/dns-mode/check

Check NS delegation (verifies nameservers point at Vexlyx).

---

## PATCH /:id/dns-mode

Switch between `CONNECTED` and `MANAGED`.

**Body:**
```json
{ "mode": "MANAGED", "skipDelegationCheck": false }
```
