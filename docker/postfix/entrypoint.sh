#!/bin/sh
set -e

echo "[Vexlyx] Initializing Postfix SMTP & OpenDKIM..."

# 0. Production hostname override (F5.1) — falls back to the baked-in
# main.cf defaults (mail.vexlyx.local) when unset, so dev is unaffected.
if [ -n "$MYHOSTNAME" ]; then
    postconf -e "myhostname = $MYHOSTNAME"
fi
if [ -n "$MYDOMAIN" ]; then
    postconf -e "mydomain = $MYDOMAIN"
fi

# 1. TLS Certificates
mkdir -p /etc/postfix/certs
if [ ! -f /etc/postfix/certs/cert.pem ] || [ ! -f /etc/postfix/certs/key.pem ]; then
    echo "[Vexlyx] Generating self-signed TLS certificates..."
    openssl req -new -newkey rsa:2048 -days 365 -nodes -x509 \
        -subj "/C=US/ST=State/L=City/O=Vexlyx/CN=${MYHOSTNAME:-mail.vexlyx.local}" \
        -keyout /etc/postfix/certs/key.pem -out /etc/postfix/certs/cert.pem
    chmod 600 /etc/postfix/certs/key.pem
    chmod 644 /etc/postfix/certs/cert.pem
fi

# 2. Virtual Maps
# The host directory docker/postfix/config is mounted as a DIRECTORY, so a git
# operation on the host can never leave the container reading a replaced file's
# old inode (#36). Its contents are runtime state written by the panel and are
# not tracked: a fresh install starts with empty maps.
VIRTUAL_DIR=/etc/postfix/vexlyx
mkdir -p "$VIRTUAL_DIR"
for name in virtual_domains virtual_mailbox_maps virtual_alias_maps; do
    touch "$VIRTUAL_DIR/$name"
    # Delivery runs as the unprivileged postfix user, which must be able to read them
    chmod 644 "$VIRTUAL_DIR/$name"
done
# 3. Virtual Mailbox Base Directory
# Required by Postfix virtual delivery agent (virtual_mailbox_base in main.cf).
# Shared with Dovecot (F4.2) via bind mount — uid:gid 5000:5000 must match
# virtual_uid_maps/virtual_gid_maps above and Dovecot's mail_uid/mail_gid.
mkdir -p /var/mail/vhosts/vexlyx.local/test
chown -R 5000:5000 /var/mail/vhosts 2>/dev/null || true

# Seed a test mailbox so virtual delivery succeeds in dev. Disabled in
# production (F5.1 sets VEXLYX_SEED_DEV_FIXTURES=false) so a fresh install's
# mail routing table isn't pre-populated with fake dev addresses.
if [ "${VEXLYX_SEED_DEV_FIXTURES:-true}" = "true" ] && [ ! -s "$VIRTUAL_DIR/virtual_mailbox_maps" ]; then
    echo "test@vexlyx.local vexlyx.local/test/Maildir/" > "$VIRTUAL_DIR/virtual_mailbox_maps"
    echo "admin@vexlyx.local vexlyx.local/test/Maildir/" >> "$VIRTUAL_DIR/virtual_mailbox_maps"
fi
# postmap drops privileges to the OWNER of the source file before writing. On a
# Linux host the API writes these bind-mounted files as its own non-root uid, so
# postmap then can't create the .lmdb in the mounted directory and every mailbox
# lookup fails. Compile a root-owned copy, then rename the result into place
# from a temporary file in the same directory so the swap is atomic.
#
# A map that cannot be compiled is fatal. Postfix would otherwise keep serving a
# stale (or no) map and reject or misroute mail with no trace of why; refusing
# to start makes the failure visible (container restart loop, unhealthy status).
compile_map() {
    name="$1"
    work=$(mktemp -d /tmp/vexlyx-map.XXXXXX) || return 1
    status=0
    if cp "$VIRTUAL_DIR/$name" "$work/$name" &&
        postmap "lmdb:$work/$name" &&
        cp "$work/$name.lmdb" "$VIRTUAL_DIR/.$name.lmdb.new" &&
        chmod 644 "$VIRTUAL_DIR/.$name.lmdb.new" &&
        mv -f "$VIRTUAL_DIR/.$name.lmdb.new" "$VIRTUAL_DIR/$name.lmdb"; then
        status=0
    else
        status=$?
    fi
    rm -rf "$work" "$VIRTUAL_DIR/.$name.lmdb.new"
    if [ "$status" -ne 0 ]; then
        echo "[Vexlyx] ERROR: failed to compile $name (exit $status)" >&2
    elif [ ! -s "$VIRTUAL_DIR/$name.lmdb" ]; then
        # On a Windows Docker Desktop bind mount (gRPC-FUSE/virtiofs) a file
        # just written is sometimes not visible yet; give it a moment first.
        sleep 0.3
        if [ ! -s "$VIRTUAL_DIR/$name.lmdb" ]; then
            echo "[Vexlyx] ERROR: $VIRTUAL_DIR/$name.lmdb is missing after the build" >&2
            status=1
        fi
    fi
    return "$status"
}
MAP_COMPILE_FAILED=0
compile_map virtual_mailbox_maps || MAP_COMPILE_FAILED=1
compile_map virtual_alias_maps || MAP_COMPILE_FAILED=1
if [ "$MAP_COMPILE_FAILED" -ne 0 ]; then
    echo "[Vexlyx] FATAL: Postfix maps could not be built; refusing to start with stale or missing routing." >&2
    exit 1
fi

# Fix all spool directory ownership (must run as root before postfix starts)
# Without this, Postfix's cleanup daemon fails with: 451 queue file write error
echo "[Vexlyx] Running postfix set-permissions to fix spool directory ownership..."
postfix set-permissions 2>&1 || true

# 3. OpenDKIM Setup
# /etc/opendkim is the mounted runtime-state directory (tables and keys, not
# tracked). The config lives in the image at /etc/opendkim.conf.
mkdir -p /etc/opendkim/keys
touch /etc/opendkim/KeyTable
touch /etc/opendkim/SigningTable
if [ ! -s /etc/opendkim/TrustedHosts ]; then
    cat <<EOF > /etc/opendkim/TrustedHosts
127.0.0.1
localhost
::1
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
EOF
fi
chown -R opendkim:opendkim /etc/opendkim || true
chmod -R 750 /etc/opendkim || true
# OpenDKIM (RequireSafeKeys) refuses a private key that group/others can read
# and answers every message for that domain with a 451, so re-assert 0600 here
# exactly as reload_opendkim() does after the blanket chmod above.
find /etc/opendkim/keys -type f -name '*.private' -exec chmod 600 {} + || true

# 4. Fix spool directory permissions (Docker volumes on Windows reset ownership)
# The maildrop dir must be owned postfix:postdrop with setgid so postfix can
# write queue files. Without this, Postfix returns: 451 queue file write error
echo "[Vexlyx] Fixing /var/spool/postfix permissions..."
postfix set-permissions 2>/dev/null || true
chown postfix:postdrop /var/spool/postfix/maildrop 2>/dev/null || true
chmod 730 /var/spool/postfix/maildrop 2>/dev/null || true
chmod g+s /var/spool/postfix/maildrop 2>/dev/null || true

# 5. Delivery/Bounce Log File (F4.8). Runs unconditionally on every start,
# not just first-run — bind-mounted host dirs can appear root:root on first
# mount on Windows Docker Desktop (same class of race documented above for
# /var/spool/postfix).
mkdir -p /var/log/postfix
touch /var/log/postfix/postfix.log
chown postfix:postfix /var/log/postfix/postfix.log
chmod 644 /var/log/postfix/postfix.log

# 6. Start OpenDKIM in background
echo "[Vexlyx] Starting OpenDKIM Milter on port 8891..."
opendkim -x /etc/opendkim.conf || echo "[Vexlyx] ERROR: OpenDKIM failed to start; outgoing mail will be unsigned" >&2

# 5. Start Postfix in foreground
echo "[Vexlyx] Starting Postfix MTA on ports 25 and 587..."
exec postfix start-fg
