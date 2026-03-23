# Archive

Material kept for reference only. **Nothing here is loaded by the runtime app** (Express, Vite build, or Netlify).

| Path | What it is |
|------|------------|
| `legacy-public/` | Old standalone trees that lived under `public/` (not referenced by routes). Moved to shrink the published static bundle and avoid confusion with `public/scripts` (EJS/static assets). |
| `backups/` | Retired source snapshots (`.backup` / `.bak`) removed from active code paths. |
| `transient/` | One-off logs or scratch output (safe to delete locally). |

To restore a file, copy it back to the path implied by its name or history, then verify the app and tests.
