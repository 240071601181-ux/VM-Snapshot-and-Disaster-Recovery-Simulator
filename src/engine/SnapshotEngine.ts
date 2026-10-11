import {
  VirtualMachine,
  Snapshot,
  SnapshotDiff,
  RecoveryAttempt,
  AuditEvent,
  SimulatedWorkloadProcess,
  SimulatedFilesystemEntry,
} from '../types';
import { SnapshotError } from './errors';

export interface CreateSnapshotOptions {
  name: string;
  description?: string;
  isConsistent?: boolean;
  parentSnapshotId?: string | null;
}

export const CURRENT_SNAPSHOT_SCHEMA_VERSION = '1.0';

/**
 * Pure domain engine for simulated VM snapshots and restorations.
 * All operations execute within browser memory and storage without real hypervisors.
 */
export class SnapshotEngine {
  /**
   * Captures an immutable snapshot of a simulated virtual machine.
   * Employs deep cloning (structuredClone) so subsequent mutations to the VM do not alter this snapshot.
   */
  public static createSnapshot(
    vm: VirtualMachine,
    options: CreateSnapshotOptions
  ): { snapshot: Snapshot; updatedVM: VirtualMachine; auditEvent: AuditEvent } {
    if (!vm || !vm.id) {
      throw new SnapshotError('Cannot capture snapshot: Target VM is invalid', 'INVALID_VM');
    }

    if (!options.name || options.name.trim().length === 0) {
      throw new SnapshotError('Snapshot name cannot be blank', 'INVALID_SNAPSHOT_NAME', undefined, vm.id);
    }

    // Deep clone state and hardware to ensure immutability
    const capturedState = structuredClone(vm.currentState);
    const capturedHardware = structuredClone(vm.hardware);

    // Calculate simulated storage delta bytes (sum of guest filesystem bytes + base overhead)
    const totalFilesKb = capturedState.filesystem.reduce((sum, f) => sum + f.sizeKb, 0);
    const simulatedDeltaBytes = Math.max(1024 * 1024 * 100, totalFilesKb * 1024); // min 100MB simulated delta

    const nowIso = new Date().toISOString();
    const snapshotId = `snap-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

    const newSnapshot: Snapshot = {
      id: snapshotId,
      vmId: vm.id,
      vmName: vm.name,
      parentSnapshotId: options.parentSnapshotId || vm.activeSnapshotId || null,
      name: options.name.trim(),
      description: options.description?.trim() || `Simulated point-in-time image for ${vm.name}`,
      createdAt: nowIso,
      vmConfig: capturedHardware,
      capturedState,
      sizeBytes: simulatedDeltaBytes,
      isConsistent: options.isConsistent ?? true,
      treeDepth: 0,
      schemaVersion: CURRENT_SNAPSHOT_SCHEMA_VERSION,
      os: vm.os,
      environment: vm.environment,
    };

    // Deep clone updated VM record with incremented count and active pointer
    const updatedVM: VirtualMachine = {
      ...structuredClone(vm),
      snapshotCount: vm.snapshotCount + 1,
      activeSnapshotId: snapshotId,
      updatedAt: nowIso,
    };

    const auditEvent: AuditEvent = {
      id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: nowIso,
      type: 'snapshot_taken',
      vmId: vm.id,
      vmName: vm.name,
      title: `Snapshot Created: ${newSnapshot.name}`,
      details: `Captured immutable point-in-time snapshot (${newSnapshot.isConsistent ? 'Consistent' : 'Crash-consistent'}). Schema v${CURRENT_SNAPSHOT_SCHEMA_VERSION}.`,
      operator: 'Simulated Hypervisor Console',
      severity: 'success',
    };

    return { snapshot: newSnapshot, updatedVM, auditEvent };
  }

  /**
   * Validates snapshot integrity and schema compatibility.
   */
  public static validateSnapshot(snapshot: Snapshot, expectedVmId?: string): void {
    if (!snapshot || !snapshot.id) {
      throw new SnapshotError('Snapshot object is missing or null', 'SNAPSHOT_NOT_FOUND');
    }

    if (!snapshot.capturedState || !snapshot.capturedState.powerState || !snapshot.capturedState.filesystem) {
      throw new SnapshotError(
        `Corrupted snapshot payload: missing captured execution state for snapshot '${snapshot.id}'`,
        'INVALID_SNAPSHOT_DATA',
        snapshot.id,
        snapshot.vmId
      );
    }

    if (!snapshot.vmConfig || !snapshot.vmConfig.cpuCores) {
      throw new SnapshotError(
        `Corrupted snapshot payload: missing hardware configuration for snapshot '${snapshot.id}'`,
        'INVALID_SNAPSHOT_DATA',
        snapshot.id,
        snapshot.vmId
      );
    }

    // Check schema compatibility
    if (snapshot.schemaVersion && snapshot.schemaVersion !== CURRENT_SNAPSHOT_SCHEMA_VERSION) {
      throw new SnapshotError(
        `Incompatible snapshot schema version '${snapshot.schemaVersion}'. Expected version '${CURRENT_SNAPSHOT_SCHEMA_VERSION}'.`,
        'INCOMPATIBLE_SNAPSHOT',
        snapshot.id,
        snapshot.vmId
      );
    }

    // Check VM ownership if expectedVmId is provided
    if (expectedVmId && snapshot.vmId !== expectedVmId) {
      throw new SnapshotError(
        `Incompatible snapshot: Snapshot '${snapshot.id}' belongs to VM '${snapshot.vmId}', not target VM '${expectedVmId}'`,
        'INCOMPATIBLE_SNAPSHOT',
        snapshot.id,
        expectedVmId
      );
    }
  }

  /**
   * Restores a simulated VM from an immutable snapshot.
   * Completely replaces the current execution state and hardware configuration with the snapshot payload.
   * Does NOT erase the snapshot.
   */
  public static restoreSnapshot(
    snapshot: Snapshot,
    targetVM: VirtualMachine
  ): {
    restoredVM: VirtualMachine;
    recoveryAttempt: RecoveryAttempt;
    auditEvent: AuditEvent;
  } {
    // Validate snapshot integrity and target VM alignment
    this.validateSnapshot(snapshot, targetVM.id);

    const nowIso = new Date().toISOString();

    // Deep clone captured state to prevent target VM future changes from mutating historical snapshot
    const restoredState = structuredClone(snapshot.capturedState);
    const restoredHardware = structuredClone(snapshot.vmConfig);

    // If restored in running state, simulate live network connectivity
    if (restoredState.powerState === 'running') {
      restoredState.network.connected = true;
      restoredState.kernelStatus = 'ok';
    }

    const restoredVM: VirtualMachine = {
      ...structuredClone(targetVM),
      currentState: restoredState,
      hardware: restoredHardware,
      activeSnapshotId: snapshot.id,
      updatedAt: nowIso,
    };

    // Simulated RTO calculation (simulated 1.5 - 4 minutes based on delta size)
    const simulatedRtoSeconds = Math.max(30, Math.round(snapshot.sizeBytes / (1024 * 1024 * 50)));

    const recoveryAttempt: RecoveryAttempt = {
      id: `rec-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      vmId: targetVM.id,
      vmName: targetVM.name,
      failureEventId: 'operator-initiated-rollback',
      targetSnapshotId: snapshot.id,
      targetSnapshotName: snapshot.name,
      attemptedAt: nowIso,
      completedAt: nowIso,
      status: 'succeeded',
      calculatedRtoSeconds: simulatedRtoSeconds,
      calculatedRpoSeconds: Math.max(
        0,
        Math.round((new Date(nowIso).getTime() - new Date(snapshot.createdAt).getTime()) / 1000)
      ),
      restoredChecksumMatch: true,
      notes: `Rollback completed. Restored ${restoredState.filesystem.length} filesystem entries and ${restoredState.processes.length} active processes from snapshot '${snapshot.name}'.`,
    };

    const auditEvent: AuditEvent = {
      id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: nowIso,
      type: 'snapshot_restored',
      vmId: targetVM.id,
      vmName: targetVM.name,
      title: `Snapshot Restored: ${snapshot.name}`,
      details: `Rolled back VM '${targetVM.name}' to point-in-time snapshot '${snapshot.name}' (${snapshot.id}). Execution state: ${restoredState.powerState}.`,
      operator: 'Simulated Hypervisor Console',
      severity: 'warning',
    };

    return { restoredVM, recoveryAttempt, auditEvent };
  }

  /**
   * Compares an immutable snapshot with the live simulated VM state, calculating granular differences.
   */
  public static compareSnapshotWithVM(snapshot: Snapshot, vm: VirtualMachine): SnapshotDiff {
    this.validateSnapshot(snapshot);

    if (snapshot.vmId !== vm.id) {
      throw new SnapshotError(
        `Cannot compare snapshot: snapshot belongs to VM '${snapshot.vmId}', but target VM is '${vm.id}'`,
        'INCOMPATIBLE_SNAPSHOT',
        snapshot.id,
        vm.id
      );
    }

    const snapState = snapshot.capturedState;
    const currState = vm.currentState;
    const snapHw = snapshot.vmConfig;
    const currHw = vm.hardware;

    // Power state diff
    const powerChanged = snapState.powerState !== currState.powerState;

    // Hardware diff
    const cpuDiff = {
      snapshot: snapHw.cpuCores,
      current: currHw.cpuCores,
      changed: snapHw.cpuCores !== currHw.cpuCores,
    };
    const memDiff = {
      snapshot: snapHw.memoryMb,
      current: currHw.memoryMb,
      changed: snapHw.memoryMb !== currHw.memoryMb,
    };
    const diskDiff = {
      snapshot: snapHw.diskSizeGb,
      current: currHw.diskSizeGb,
      changed: snapHw.diskSizeGb !== currHw.diskSizeGb,
    };
    const hardwareChanged = cpuDiff.changed || memDiff.changed || diskDiff.changed;

    // Processes diff
    const snapProcessMap = new Map<string, SimulatedWorkloadProcess>(
      snapState.processes.map((p) => [p.name, p])
    );
    const currProcessMap = new Map<string, SimulatedWorkloadProcess>(
      currState.processes.map((p) => [p.name, p])
    );

    const addedProcesses: SimulatedWorkloadProcess[] = [];
    const modifiedProcesses: { process: SimulatedWorkloadProcess; snapshotCpu: number; currentCpu: number }[] = [];
    const removedProcesses: SimulatedWorkloadProcess[] = [];

    currProcessMap.forEach((currProc, name) => {
      const snapProc = snapProcessMap.get(name);
      if (!snapProc) {
        addedProcesses.push(currProc);
      } else if (snapProc.cpuPercent !== currProc.cpuPercent || snapProc.status !== currProc.status) {
        modifiedProcesses.push({
          process: currProc,
          snapshotCpu: snapProc.cpuPercent,
          currentCpu: currProc.cpuPercent,
        });
      }
    });

    snapProcessMap.forEach((snapProc, name) => {
      if (!currProcessMap.has(name)) {
        removedProcesses.push(snapProc);
      }
    });

    // Filesystem diff
    const snapFilesMap = new Map<string, SimulatedFilesystemEntry>(
      snapState.filesystem.map((f) => [f.path, f])
    );
    const currFilesMap = new Map<string, SimulatedFilesystemEntry>(
      currState.filesystem.map((f) => [f.path, f])
    );

    const addedFiles: SimulatedFilesystemEntry[] = [];
    const modifiedFiles: { path: string; snapshotChecksum: string; currentChecksum: string }[] = [];
    const removedFiles: SimulatedFilesystemEntry[] = [];

    currFilesMap.forEach((currFile, path) => {
      const snapFile = snapFilesMap.get(path);
      if (!snapFile) {
        addedFiles.push(currFile);
      } else if (snapFile.checksum !== currFile.checksum) {
        modifiedFiles.push({
          path,
          snapshotChecksum: snapFile.checksum,
          currentChecksum: currFile.checksum,
        });
      }
    });

    snapFilesMap.forEach((snapFile, path) => {
      if (!currFilesMap.has(path)) {
        removedFiles.push(snapFile);
      }
    });

    const totalProcDiffs = addedProcesses.length + removedProcesses.length + modifiedProcesses.length;
    const totalFileDiffs = addedFiles.length + removedFiles.length + modifiedFiles.length;

    const hasAnyDifferences =
      powerChanged || hardwareChanged || totalProcDiffs > 0 || totalFileDiffs > 0;

    return {
      snapshotId: snapshot.id,
      vmId: vm.id,
      powerStateDiff: {
        snapshot: snapState.powerState,
        current: currState.powerState,
        changed: powerChanged,
      },
      hardwareDiff: {
        cpuCores: cpuDiff,
        memoryMb: memDiff,
        diskSizeGb: diskDiff,
        hasChanges: hardwareChanged,
      },
      processesDiff: {
        addedInCurrent: addedProcesses,
        removedInCurrent: removedProcesses,
        modified: modifiedProcesses,
        totalDifferences: totalProcDiffs,
      },
      filesystemDiff: {
        addedInCurrent: addedFiles,
        removedInCurrent: removedFiles,
        modified: modifiedFiles,
        totalDifferences: totalFileDiffs,
      },
      hasAnyDifferences,
    };
  }
}
