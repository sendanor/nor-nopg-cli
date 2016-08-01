#!/bin/bash -x

set -e

tr="$(nopg start)"

function finish {
	test -n "$tr" && nopg $tr rollback
}
trap finish EXIT

nopg $tr search User
nopg $tr commit
tr=''

