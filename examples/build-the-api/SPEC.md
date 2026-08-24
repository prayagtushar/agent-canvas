# Notes store

Build `src/notes.js`. It exports one function, `createStore()`, which returns
an object with the methods below. Everything is in memory; there is no
database, no server and no dependency to install.

## `add({ title, body, tags })`

Returns the stored note: `{ id, title, body, tags, createdAt }`.

- `id` is a string, unique per store, and stable once assigned.
- `title` is required and must be a non-empty string after trimming.
  Otherwise throw `Error("title is required")`.
- `body` defaults to `""`.
- `tags` defaults to `[]`, is de-duplicated, and is lower-cased.
- `createdAt` is a number of milliseconds.

## `get(id)`

The note, or `undefined`.

## `list({ tag, q } = {})`

Every note, newest first.

- `tag` keeps only notes carrying that tag, matched case-insensitively.
- `q` keeps only notes whose title or body contains it, case-insensitively.
- The two combine: both must match.

## `update(id, patch)`

Applies `patch` and returns the updated note. Throws `Error("no such note")`
if the id is unknown. `id` and `createdAt` cannot be changed. Tags in a patch
go through the same cleaning as `add`.

## `remove(id)`

Returns `true` if a note went away, `false` if there was nothing to remove.

## `stats()`

`{ count, tags }`, where `tags` maps each tag to how many notes carry it.
