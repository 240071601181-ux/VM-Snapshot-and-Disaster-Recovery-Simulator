"""Diagnostic: find out what 500 error is actually happening."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/..')

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models  # noqa
from database import Base, get_db
from main import app

engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

def override_get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

# Use raise_server_exceptions=True to see the actual traceback
try:
    client = TestClient(app, raise_server_exceptions=True)
    resp = client.post('/api/vms', json={
        "id": "vm-test-01",
        "name": "test-server",
        "description": "Unit test VM",
        "environment": "staging",
        "os": "Ubuntu 24.04 LTS",
        "hardware": {"cpu_cores": 4, "memory_mb": 8192, "disk_size_gb": 100},
    })
    print("Status:", resp.status_code)
    print("Body:", resp.json())
except Exception:
    import traceback
    traceback.print_exc()
