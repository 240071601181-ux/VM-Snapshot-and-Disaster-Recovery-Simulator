"""
database.py – SQLAlchemy synchronous SQLite engine + session factory.

Schema is initialized on application startup via init_db(). This is idempotent
(uses CREATE TABLE IF NOT EXISTS semantics via metadata.create_all). No migration
tool is required for the current MVP; a migration history section is included in
SCHEMA_README below should Alembic be adopted later.

SCHEMA_README
=============
Tables created by this module:
  - vm_records          – VM metadata references
  - snapshot_metadata   – Snapshot metadata (NOT real VirtualBox snapshots)
  - recovery_attempts   – Disaster-recovery attempt records
  - audit_events        – Immutable chronological audit log

VirtualBox is the source of truth for real VM and snapshot state. This database
stores application-level metadata only. No real VBoxManage operations are executed.

No passwords or secrets are stored.
"""

import os
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./simulator.db")

# Synchronous engine. For SQLite, check_same_thread must be False when used
# across FastAPI's threading model.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

# Enable WAL mode for better concurrent read performance on SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Create all tables if they don't already exist. Idempotent."""
    # Import models here to ensure they are registered on Base.metadata
    import models  # noqa: F401  – side-effect import to register ORM classes
    Base.metadata.create_all(bind=engine)
    _migrate_snapshot_capture_columns()


def _migrate_snapshot_capture_columns() -> None:
    """Phase 4 lightweight migration: add snapshot state capture columns.

    create_all() does not ALTER pre-existing tables, so file databases created
    before Phase 4 need these columns added explicitly. Fresh/test databases
    already include them via metadata. Safe to run repeatedly.
    """
    from sqlalchemy import inspect, text

    with engine.begin() as conn:
        if "snapshot_metadata" not in inspect(conn).get_table_names():
            return
        existing = {c["name"] for c in inspect(conn).get_columns("snapshot_metadata")}
        for column in ("state_json", "hardware_json"):
            if column not in existing:
                conn.execute(text(f"ALTER TABLE snapshot_metadata ADD COLUMN {column} TEXT DEFAULT '{{}}'"))


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
