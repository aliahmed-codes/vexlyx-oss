#!/bin/sh
# Healthy only when every compiled Postfix map exists, is readable by the
# unprivileged postfix user, is at least as new as its source, and the
# milter and the MTA are running. A listening port alone says nothing about
# whether routing data is current.
VIRTUAL_DIR=/etc/postfix/vexlyx

for name in virtual_mailbox_maps virtual_alias_maps; do
    source="$VIRTUAL_DIR/$name"
    lmdb="$source.lmdb"
    [ -f "$lmdb" ] || { echo "$lmdb is missing" >&2; exit 1; }
    if [ "$source" -nt "$lmdb" ]; then
        echo "$name changed after its map was built" >&2
        exit 1
    fi
    su -s /bin/sh postfix -c "postmap -s lmdb:$source >/dev/null" || {
        echo "$lmdb is unreadable or corrupt" >&2
        exit 1
    }
done

pidof opendkim >/dev/null || { echo "opendkim is not running" >&2; exit 1; }
pidof master >/dev/null || { echo "postfix master is not running" >&2; exit 1; }
