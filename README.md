# nor-nopg-cli

Shell scripting CLI for [nor-nopg](https://github.com/sendanor/nor-nopg/)

### Install

`npm install -g nopg`

### Status

Not well tested, but should work.

### Example

```bash
#!/bin/bash
set -e
tr=''
function finish {
	status="$?"
	test -n "$tr" && nopg -b -q $tr rollback
	exit "$status"
}
trap finish EXIT
tr="$(nopg -b -q start)"

nopg -b -q $tr search User
nopg -b -q $tr commit
tr=''
exit 0
```

### Transactions

Start a transaction:

```bash
tr = "$(nopg -b -q start)"
```

End a transaction successfully:

```bash
nopg $tr commit
```

Rollback a transaction:

```bash
nopg $tr rollback
```

### List all `User` documents

```bash
nopg $tr search User
```

### List all `User` documents by email

```bash
nopg $tr search User --where-email='demo@example.com'
```

### Create a `User` document

```bash
nopg $tr create User --set-email='demo@example.com'
```

### Update a `User` document

```bash
nopg $tr update User --where-email='demo@example.com' --set-email='demo2@example.com'
```

### Delete a `User` document by email

```bash
nopg $tr delete User --where-email='demo@example.com'
```

### Force shutdown

You shouldn't normally need to use this, since `rollback` or `commit` does it also.

```bash
nopg $tr exit
```

...or, since `$tr` is just a pid:

```bash
kill $tr
```
