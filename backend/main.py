"""
main.py – FastAPI application entry point for the VM Snapshot & DR Simulator backend.

SECURITY NOTE: No passwords or secrets are stored in the database.
VirtualBox is the source of truth for real VM/snapshot state.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator, Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError

from database import init_db
from routers import dashboard, vms, snapshots, recovery, audit, failures


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialize the database schema on startup."""
    init_db()
    yield


app = FastAPI(
    title="VM Snapshot & Disaster Recovery Simulator API",
    description=(
        "Backend API for managing metadata of simulated VMs, snapshots, "
        "recovery attempts, and audit events. "
        "VirtualBox is the source of truth for real hypervisor state."
    ),
    version="3.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Exception handlers – consistent error envelope
# ---------------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = exc.errors()
    detail = "; ".join(
        f"{'.'.join(str(loc) for loc in e['loc'])}: {e['msg']}"
        for e in errors
    )
    return JSONResponse(
        status_code=422,
        content={"error": "validation_error", "detail": detail},
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(
    request: Request, exc: SQLAlchemyError
) -> JSONResponse:
    """Catch any SQLAlchemyError that escapes per-endpoint handling.

    Returns a safe JSON envelope without leaking internal DB details.
    """
    return JSONResponse(
        status_code=500,
        content={"error": "database_error", "detail": "Database error occurred"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Final safety net: always return JSON, never plain-text or tracebacks."""
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": "Internal server error"},
    )


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(dashboard.router)
app.include_router(vms.router)
app.include_router(snapshots.router)
app.include_router(recovery.router)
app.include_router(audit.router)
app.include_router(failures.router)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, Any]:
    return {"status": "ok", "service": "vm-snapshot-dr-simulator-api", "version": "3.0.0"}
