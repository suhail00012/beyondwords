# Base44 environment notes — Beyondwords

## What this repository is

Beyondwords is a **Python 3.11+ local toolkit** (`tools/`, `.agents/skills/beyondwords/scripts/`)
shipped as an **assistant skill** (`.agents/skills/beyondwords/SKILL.md`). The web app
(`webapp/server.py`) adds a publishing-workflow management UI on top of the toolkit.

## How the sandbox runs it

- **Service `toolkit`** (`python:3.12-slim`): bind-mounts the source at `/workspace` and
  the config at `/config:ro`.
- On first boot, `tools/setup_runtime.py --mcp` installs the reviewed locked dependencies
  from `requirements/optional.lock` and `requirements/mcp.lock` into a named volume
  (`/runtime/venv`).
- `webapp/server.py` is a self-contained Python web app (stdlib only: `http.server` +
  `sqlite3`) that serves the publishing workflow dashboard, project management, task
  tracking, deadline calendar, progress bars, and stage status indicators on port 3000.
- The SQLite database lives at `/data/workflow.db` in the `bwdata` named volume.
- A `/healthz` endpoint returns `{"status":"ok"}` for the compose healthcheck.

## Verification

```bash
docker compose -f docker-compose.base44.yml up -d --build
curl -s http://localhost:3000/healthz   # → {"status":"ok"}
curl -s http://localhost:3000/           # → publishing workflow dashboard
```

## Secrets

No external credentials are required to boot. The web app uses only local storage.
Optional user-owned integrations (Amazon Ads API, attended KDP publishing) remain
unconfigured.
