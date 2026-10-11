"""Run diagnostic and save output cleanly."""
import os
import sys
import traceback

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '.')

try:
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    import models  # noqa
    from database import Base, get_db
    from main import app

    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    S = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    def odb():
        db = S()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = odb

    # Raise server exceptions so we see the real traceback
    client = TestClient(app, raise_server_exceptions=True)

    print("Testing GET /api/vms...")
    try:
        r = client.get('/api/vms')
        print(f"  Status: {r.status_code}")
        print(f"  Body: {r.text[:400]}")
    except Exception as e:
        print(f"  EXCEPTION: {type(e).__name__}: {e}")
        traceback.print_exc()

    print("\nTesting POST /api/vms...")
    try:
        r = client.post('/api/vms', json={
            "id": "vm-test-01",
            "name": "test-server",
            "environment": "staging",
            "os": "Ubuntu 24.04 LTS",
            "hardware": {"cpu_cores": 4, "memory_mb": 8192, "disk_size_gb": 100},
        })
        print(f"  Status: {r.status_code}")
        print(f"  Body: {r.text[:400]}")
    except Exception as e:
        print(f"  EXCEPTION: {type(e).__name__}: {e}")
        traceback.print_exc()

except Exception as e:
    print(f"IMPORT/SETUP ERROR: {type(e).__name__}: {e}")
    traceback.print_exc()

with open('diag_result.txt', 'w', encoding='utf-8') as f:
    f.write("done")
