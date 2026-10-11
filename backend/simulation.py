"""
simulation.py – Pure simulation helpers for the Phase 4 lifecycle/snapshot engine.

Simulation-only: no hypervisor calls, no VirtualBox interaction. All state is
application-level metadata stored in the existing tables (VMRecord.state_json,
SnapshotMetadata.state_json/hardware_json).

Transition rules mirror the frontend engine (src/engine/stateTransitions.ts)
for the supported backend actions: start, stop, restart.
"""

from __future__ import annotations

import json
from typing import Any, Literal

PowerState = Literal["running", "stopped", "paused", "crashed", "corrupted"]
LifecycleAction = Literal["start", "stop", "restart"]

VALID_POWER_STATES: tuple[str, ...] = ("running", "stopped", "paused", "crashed", "corrupted")

# current_state -> {action: next_state}
VALID_TRANSITIONS: dict[str, dict[str, str]] = {
    "stopped": {"start": "running"},
    "running": {"stop": "stopped", "restart": "running"},
    "paused": {"stop": "stopped"},
    "crashed": {"stop": "stopped"},
    "corrupted": {"stop": "stopped"},
}

DEFAULT_HARDWARE: dict[str, int] = {"cpu_cores": 0, "memory_mb": 0, "disk_size_gb": 0}


class InvalidTransitionError(ValueError):
    """Raised when a lifecycle action is not allowed from the current state."""

    def __init__(self, vm_name: str, vm_id: str, current: str, action: str) -> None:
        self.vm_id = vm_id
        self.current = current
        self.action = action
        if action == "start" and current == "running":
            explanation = f"Virtual machine '{vm_name}' is already running."
        elif action == "stop" and current == "stopped":
            explanation = f"Virtual machine '{vm_name}' is already stopped."
        elif action == "restart" and current == "stopped":
            explanation = (
                f"Cannot restart stopped virtual machine '{vm_name}'. Start it instead."
            )
        else:
            explanation = (
                f"Cannot {action} virtual machine '{vm_name}' "
                f"from state '{current}'."
            )
        super().__init__(f"Invalid simulated state transition: {explanation}")


def validate_transition(current: str, action: str, vm_name: str, vm_id: str) -> str:
    """Return the next power state, or raise InvalidTransitionError."""
    allowed = VALID_TRANSITIONS.get(current, {})
    nxt = allowed.get(action)
    if nxt is None:
        raise InvalidTransitionError(vm_name, vm_id, current, action)
    return nxt


def get_power_state(state_json: Any) -> str:
    """Extract power_state from a VMRecord.state_json payload. Defaults to stopped."""
    if not state_json:
        return "stopped"
    try:
        data = json.loads(state_json) if isinstance(state_json, str) else state_json
    except (json.JSONDecodeError, TypeError):
        return "stopped"
    state = data.get("power_state") if isinstance(data, dict) else None
    return state if state in VALID_POWER_STATES else "stopped"


def make_state_json(power_state: str) -> str:
    """Serialize a power state into the VMRecord.state_json envelope."""
    return json.dumps({"power_state": power_state})


def parse_hardware(hardware_json: Any) -> dict[str, int]:
    """Parse a hardware JSON payload, falling back to zeroed defaults."""
    if not hardware_json:
        return dict(DEFAULT_HARDWARE)
    try:
        data = json.loads(hardware_json) if isinstance(hardware_json, str) else hardware_json
    except (json.JSONDecodeError, TypeError):
        return dict(DEFAULT_HARDWARE)
    if not isinstance(data, dict):
        return dict(DEFAULT_HARDWARE)
    out = dict(DEFAULT_HARDWARE)
    for key in out:
        try:
            out[key] = int(data.get(key, 0))
        except (TypeError, ValueError):
            out[key] = 0
    return out


def compute_diff(
    snapshot_id: str,
    snapshot_vm_id: str,
    snap_power: str,
    snap_hw: dict[str, int],
    curr_power: str,
    curr_hw: dict[str, int],
) -> dict[str, Any]:
    """Build a deterministic snapshot-vs-current diff payload."""
    power_changed = snap_power != curr_power
    hw_fields = {}
    hw_changed = False
    for key in ("cpu_cores", "memory_mb", "disk_size_gb"):
        changed = snap_hw.get(key, 0) != curr_hw.get(key, 0)
        hw_changed = hw_changed or changed
        hw_fields[key] = {
            "snapshot": snap_hw.get(key, 0),
            "current": curr_hw.get(key, 0),
            "changed": changed,
        }
    return {
        "snapshot_id": snapshot_id,
        "vm_id": snapshot_vm_id,
        "power_state_diff": {
            "snapshot": snap_power,
            "current": curr_power,
            "changed": power_changed,
        },
        "hardware_diff": {**hw_fields, "has_changes": hw_changed},
        "has_any_differences": power_changed or hw_changed,
    }
