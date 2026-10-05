---
title: Changelog
---

# Changelog

See the full [CHANGELOG.md](https://github.com/atlantiqs-org/vexlyx/blob/main/CHANGELOG.md) on GitHub for the complete history.

## Latest additions

### System transactional email (F5.23)
Password reset, 2FA security alerts, and quota warnings via nodemailer + Postfix relay. No third-party dependency.

### File Manager: chmod + archives (F5.24)
Change file/directory permissions via octal mode dialog. Extract zip/tar.gz archives and compress files to zip — all from the browser.

### Two-factor authentication (F5.17)
TOTP/authenticator app 2FA with QR code setup flow. Enforced at login with a 5-minute pending token.

### Fine-grained permissions (F5.19)
Grant specific capabilities (`canManageDns`, `canManageFirewall`, etc.) to users beyond their role.

### Per-domain DNS mode (F5.25)
DNS hosting is now a deliberate opt-in. Domains default to CONNECTED; MANAGED requires NS delegation.

### Public authoritative DNS (F5.27)
CoreDNS can now serve the internet with `Corefile.public` (no forward recursion) bound to the public IP.
