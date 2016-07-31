# nor-nopg-cli

Shell scripting CLI for nopg

### Status

This project is not implemented yet.

### Transactions

Start a transaction:

```
nopg start
```

End a transaction successfully:

```
nopg commit
```

Rollback a transaction:

```
nopg rollback
```

### List all `User` documents

```
nopg search User
```

### List all `User` documents by email

```
nopg search User --where-email='demo@example.com'
```

### Get `User` document by email

```
nopg get User --where-email='demo@example.com'
```

### Create a `User` document

```
nopg create User --set-email='demo@example.com'
```

### Update a `User` document

```
nopg update User --where-email='demo@example.com' --set-email='demo2@example.com'
```

### Delete a `User` document by email

```
nopg delete User --where-email='demo@example.com'
```

