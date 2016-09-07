#!/bin/bash -x

# NOPG_EVENT_ID
# NOPG_EVENT_NAME
# NOPG_EVENT_TYPE

set -e

test -n "$NOPG_TR"
test -n "$NOPG_EVENT_ID"

export NOPG_TR=''
TR=''
function finish {
    status="$?"
    test -n "$TR" && nopg -b -q "$TR" rollback
    exit "$status"
}
trap finish EXIT
TR="$(nopg -b -q start)"

test -n "$TR"

nopg -b -q "$TR" update --where-'$id'="$NOPG_EVENT_ID" --set-description="Testing $(date)"

nopg -b -q "$TR" commit
tr=''
exit 0
