# Auth API

All endpoints are prefixed with `/api/auth`.

## POST /register

Create a new user account. Requires `ALLOW_REGISTRATION=true` env var.

**Rate limit:** 5/15min per IP

**Body:**
```json
{
  "email": "user@example.com",
  "name": "Jane Doe",
  "password": "minimum8chars",
  "confirmPassword": "minimum8chars"
}
```

**Response `201`:**
```json
{ "user": { "id": "...", "email": "...", "name": "...", "role": "USER", ... } }
```

---

## POST /login

**Rate limit:** 5/15min per IP

**Body:**
```json
{ "email": "user@example.com", "password": "..." }
```

**Response `200` (no 2FA):**
```json
{ "user": { ... } }
```

**Response `200` (2FA enabled):**
```json
{ "requiresTotp": true, "pendingToken": "..." }
```

---

## POST /totp/verify-login

Exchange a pending TOTP token for a real session.

**Body:**
```json
{ "pendingToken": "...", "totpToken": "123456" }
```

**Response `200`:**
```json
{ "user": { ... } }
```

---

## POST /logout

Destroys the current session.

**Response `200`:**
```json
{ "message": "Logged out" }
```

---

## GET /me

Returns the currently authenticated user.

**Response `200`:**
```json
{ "user": { "id": "...", "email": "...", "role": "...", ... } }
```

---

## POST /change-password

**Auth required. Rate limit:** 5/15min

**Body:**
```json
{
  "currentPassword": "...",
  "newPassword": "...",
  "confirmNewPassword": "..."
}
```

**Response `200`:**
```json
{ "message": "Password changed" }
```

---

## GET /config

Returns panel configuration visible to unauthenticated clients.

**Response `200`:**
```json
{ "allowRegistration": false }
```

---

## POST /forgot-password

Sends a password reset email. Always returns 200 to prevent user enumeration.

**Rate limit:** 5/15min

**Body:**
```json
{ "email": "user@example.com" }
```

---

## POST /reset-password

Exchange a reset token for a new password.

**Rate limit:** 10/15min

**Body:**
```json
{
  "token": "...",
  "password": "newpassword",
  "confirmPassword": "newpassword"
}
```

---

## POST /totp/setup

Generate a TOTP secret and QR code. Does not enable 2FA yet.

**Auth required.**

**Response `200`:**
```json
{
  "secret": "BASE32SECRET",
  "qrCodeDataUrl": "data:image/png;base64,...",
  "otpauthUrl": "otpauth://totp/..."
}
```

---

## POST /totp/enable

Activate 2FA after verifying the first code.

**Auth required. Rate limit:** 5/15min

**Body:**
```json
{ "token": "123456" }
```

---

## POST /totp/disable

Deactivate 2FA by re-verifying password.

**Auth required. Rate limit:** 5/15min

**Body:**
```json
{ "password": "..." }
```
