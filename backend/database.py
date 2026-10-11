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
  - failure_events      – Controlled failure-injection records (simulation only)
  - audit_events        – Immutable chronological audit log

MIGRATION HISTORY
=================
  - Phase 4: snapshot_metadata gained state_json/hardware_json capture
    columns. File databases created before Phase 4 are upgraded in place
    by migrate_legacy_databases() – existing rows are never modified or
    deleted, missing columns are added with safe defaults.
  - Phase 7: migration generalized – any model-declared column missing
    from a pre-existing table is added the same way; missing tables are
    created by create_all(). All migrations are idempotent.

VirtualBox is the source of truth for real VM and snapshot state. This database
stores application-level metadata only. No real VBoxManage operations are executed.

No passwords or secrets are stored.
"""

import os
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

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
    migrate_legacy_databases(engine)


def _migration_default(column) -> str:
    """SQL literal default for an added column so existing rows stay valid."""
    default = getattr(column, "default", None)
    arg = getattr(default, "arg", None) if default is not None else None
    if isinstance(arg, bool):
        return "1" if arg else "0"
    if isinstance(arg, (int, float)):
        return str(arg)
    if isinstance(arg, str):
        return "'" + arg.replace("'", "''") + "'"
    # Fallback by column type for columns without a scalar Python default.
    name = type(column.type).__name__.lower()
    if "int" in name or "float" in name or "numeric" in name or "bool" in name:
        return "0"
    return "''"


def migrate_legacy_databases(bind_engine) -> None:
    """Upgrade pre-existing file databases without destroying data.

    1. create_all() creates tables missing entirely (e.g. failure_events
       on databases from before Phase 5) – existing tables untouched.
    2. Any model-declared column absent from an existing table is added
       via ALTER TABLE with a safe default – existing rows keep their
       values; the new column is backfilled with the default.

    Idempotent: safe to run on every startup and safe to run repeatedly.
    """
    # Import models here to ensure they are registered on Base.metadata
    from sqlalchemy import inspect, text

    import models  # noqa: F401  – side-effect import to register ORM classes

    Base.metadata.create_all(bind=bind_engine)
    with bind_engine.begin() as conn:
        tables = set(inspect(conn).get_table_names())
        for table_name, table in Base.metadata.tables.items():
            if table_name not in tables:
                continue
            existing = {c["name"] for c in inspect(conn).get_columns(table_name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                coltype = column.type.compile(bind_engine.dialect)
                if column.nullable:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column.name} {coltype}"))
                else:
                    default = _migration_default(column)
                    conn.execute(
                        text(
                            f"ALTER TABLE {table_name} ADD COLUMN {column.name} "
                            f"{coltype} NOT NULL DEFAULT {default}"
                        )
                    )


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
