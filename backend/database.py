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


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
