# Mail API

All endpoints prefixed with `/api/mail`. Auth required.

## GET /status

Get Postfix/Dovecot service status.

---

## GET /mailboxes

List mailboxes for the authenticated user.

---

## POST /mailboxes

Create a mailbox.

**Body:**
```json
{ "username": "alice", "domain": "example.com", "password": "..." }
```

---

## DELETE /mailboxes/:id

Delete a mailbox.

---

## GET /aliases

List virtual aliases.

---

## POST /aliases

Create an alias.

---

## DELETE /aliases/:id

Delete an alias.

---

## GET /auth/:domainId

Get DKIM/SPF/DMARC status for a domain.

---

## POST /auth/:domainId/check

Check live DNS records for mail authentication.

---

## POST /auth/:domainId/rotate-key

Rotate the DKIM key for a domain.
