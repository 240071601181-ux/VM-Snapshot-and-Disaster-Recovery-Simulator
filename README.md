# VM Snapshot & Disaster Recovery Simulator

A browser-based **simulator** for VM lifecycle management, point-in-time snapshots,
controlled failure injection, and disaster-recovery drills.

> **Scope limitation — read first:** this project is a browser-based simulator,
> **not** a real hypervisor or operating-system recovery platform. It never talks
> to VirtualBox/VMware/KVM, never runs guest operating systems, never executes
> host commands, and cannot back up or restore real machines. Every VM, snapshot,
> failure, and recovery here is application-level metadata plus simulated state
> stored in a local SQLite database and manipulated in browser memory.

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  React + Vite frontend (/)  │         │  FastAPI backend (backend/)  │
│  src/                       │  HTTP   │  main.py + routers/          │
│  • Demo mode: in-browser    │ ◄─────► │  • SQLite via SQLAlchemy     │
│    engines + mock data      │  /api/* │  • Pure simulation logic in  │
│  • Live mode: real backend  │         │    simulation.py (no host    │
│    responses via src/api/   │         │    calls, ever)              │
└─────────────────────────────┘         └──────────────────────────────┘
```

Backend tables: `vm_records`, `snapshot_metadata`, `recovery_attempts`,
`failure_events`, `audit_events`. `VirtualBox is the source of truth` for any
real hypervisor state — this database intentionally stores simulation metadata
only. No passwords or secrets are stored anywhere.

## Prerequisites

- Python 3.12+ with `pip`
- Node.js 18+ with `npm`

## Installation

```powershell
# Backend
cd backend
pip install -r requirements.txt

# Frontend (repo root)
npm install
```

## Environment configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./simulator.db` | Backend SQLite location (file is git-ignored; legacy files auto-migrate on startup) |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Frontend → backend base URL (Vite dev proxy also forwards `/api`) |
| `VITE_API_TIMEOUT_MS` | `10000` | Frontend API timeout before showing retry UI |

Copy nothing secret: there are no credentials in this project. Never commit
`.env` files, `*.db` files, or `__pycache__/` (see `.gitignore`).

## Running

```powershell
# Terminal 1 – backend (http://localhost:8000, docs at /docs)
cd backend
uvicorn main:app --reload

# Terminal 2 – frontend (http://localhost:5173)
npm run dev
```

Open the frontend, then press **Connect Backend** in the header to switch from
`DEMO — LOCAL SIMULATION` to `LIVE — BACKEND API`. Demo data and live API data
are never mixed.

## API documentation

Interactive docs: `http://localhost:8000/docs`. Main resources:

| Area | Endpoints |
|---|---|
| VMs | `GET/POST /api/vms`, `GET/PUT/DELETE /api/vms/{id}`, `POST /api/vms/{id}/start\|stop\|restart` |
| Snapshots | `GET/POST /api/snapshots`, `GET/DELETE /api/snapshots/{id}`, `GET /api/vms/{id}/snapshots`, `POST /api/vms/{id}/snapshots`, `GET /api/snapshots/{id}/diff`, `POST /api/snapshots/{id}/restore` |
| Failures | `GET/POST /api/failures`, `GET /api/failures/{id}` (scenarios: `application_crash`, `configuration_corruption`, `service_outage`, `failed_health_check`, `interrupted_recovery`) |
| Recovery | `GET/POST /api/recovery`, `GET /api/recovery/{id}`, `POST /api/recovery/execute` (requires `confirmed: true`) |
| Audit | `GET /api/audit` |
| Dashboard | `GET /api/dashboard` (see metric formulas below) |
| Health | `GET /health` |

Conventions: `201` on create, `404` unknown id, `409` duplicate or illegal
transition/ownership mismatch, `422` `{"error": "validation_error", ...}`,
`500` safe `{"detail": "Database error occurred"}` (internals never leak).
No authentication: single-operator local simulator by design.

### Dashboard metric formulas (all derived from recorded rows)

- `success_rate_percent = 100 * succeeded / total_recovery_attempts`, `0.0` when empty
- `mean_time_to_recovery_seconds` = average `calculated_rto_seconds` over `succeeded` only, `0.0` when none
- `failed_recoveries` counts `status == 'failed'` exactly; `in_progress` is reported separately
- `recent_recovery_attempts` = latest 5 attempts by `attempted_at` descending
- All timestamps are UTC ISO 8601

## Testing

```powershell
# Backend (from backend/): 131 tests
python -m pytest tests/ -q

# Backend lint (from backend/, config in pyproject.toml)
python -m ruff check .

# Frontend (repo root): 68 tests
npm test

# Frontend lint + type checks and production build
npm run lint
npm run typecheck
npm run build

# End-to-end demonstration (11 steps, asserts every response)
cd backend
python demo_walkthrough.py
```

## Demonstration (also runnable via `backend/demo_walkthrough.py`)

1. Create simulated VM `demo-web-01` (starts `stopped`)
2. Start it → `running`
3. Capture snapshot **A** (frozen `running`, 4 vCPU)
4. Modify hardware → 8 vCPU / 16 GB / 200 GB
5. Capture snapshot **B** (frozen 8 vCPU)
6. Inject `application_crash` → VM `crashed`, failure event recorded
7. Execute guarded recovery of snapshot **A** (`confirmed: true`) → `succeeded`, reports `crashed → running`
8. Verify VM is `running` with 4 vCPU and zero drift vs snapshot **A**
9. Verify history: snapshots **A** and **B** intact, **B** immutable
10. Verify audit (`failure_injected`, `recovery_initiated`, `recovery_succeeded`) and metrics (1/1 recovery, 100%, 1 failure)
11. Restart the app (new client, same DB file) and verify VM, snapshots, and attempts persist

## Limitations

- Browser-based simulation only: no real hypervisors, guests, or host recovery.
- Backend tracks power state + hardware/config per VM; guest processes, filesystem
  contents, and network telemetry shown in Demo mode are in-browser fabrications,
  while Live mode honestly reports them as unreported/empty.
- No multi-user auth or authorization; anyone with API access is a full operator.
- CORS allows any origin with credentials disabled (local-demo posture).
- SQLite file DB: per-VM in-process locks serialize concurrent mutations of one
  VM; cross-process writers rely on SQLite locking.
- `node_modules/`, `dist/`, and Python bytecode were removed from version
  control (reproducible via `npm install` / `npm run build`); new generated
  files are git-ignored going forward.
