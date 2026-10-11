import { describe, it, expect } from 'vitest';
import { SnapshotEngine, CURRENT_SNAPSHOT_SCHEMA_VERSION } from '../engine/SnapshotEngine';
import { SnapshotError } from '../engine/errors';
import { VirtualMachine, Snapshot } from '../types';

describe('SnapshotEngine Domain Engine', () => {
  const createMockVM = (id = 'vm-test-alpha', name = 'alpha-node'): VirtualMachine => ({
    id,
    name,
    description: 'Unit test virtual machine',
    environment: 'production',
    hardware: {
      cpuCores: 4,
      memoryMb: 8192,
      diskSizeGb: 100,
    },
    currentState: {
      powerState: 'running',
      osName: 'Ubuntu 24.04 LTS (Simulated)',
      kernelStatus: 'ok',
      simulatedUptimeSeconds: 1200,
      cpuUsagePercent: 25.5,
      memoryUsageMb: 3000,
      network: {
        ipAddress: '10.0.1.20',
        connected: true,
        rxPackets: 1500,
        txPackets: 1200,
      },
      processes: [
        { pid: 101, name: 'nginx-ingress', cpuPercent: 12.0, memoryMb: 1024, status: 'healthy' },
        { pid: 102, name: 'app-service', cpuPercent: 13.5, memoryMb: 1976, status: 'healthy' },
      ],
      filesystem: [
        {
          path: '/etc/nginx/nginx.conf',
          checksum: 'sha256:nginx_orig_hash',
          sizeKb: 14,
          lastModifiedSimulated: '2026-10-11T12:00:00Z',
        },
        {
          path: '/var/data/app.db',
          checksum: 'sha256:app_db_orig_hash',
          sizeKb: 250000,
          lastModifiedSimulated: '2026-10-11T12:00:00Z',
        },
      ],
    },
    activeSnapshotId: null,
    snapshotCount: 0,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-11T12:00:00Z',
  });

  describe('1. Deep Immutability Preserves Original State', () => {
    it('proves a snapshot preserves original state even when the live VM is subsequently mutated', () => {
      const vm = createMockVM();

      // 1. Capture snapshot
      const { snapshot, updatedVM } = SnapshotEngine.createSnapshot(vm, {
        name: 'Baseline Pre-Deploy',
        description: 'Captured before destructive deployment simulation',
      });

      expect(snapshot.id).toBeDefined();
      expect(snapshot.schemaVersion).toBe(CURRENT_SNAPSHOT_SCHEMA_VERSION);
      expect(updatedVM.snapshotCount).toBe(1);
      expect(updatedVM.activeSnapshotId).toBe(snapshot.id);

      // Verify captured files and processes match initial state
      expect(snapshot.capturedState.processes).toHaveLength(2);
      expect(snapshot.capturedState.filesystem).toHaveLength(2);
      expect(snapshot.capturedState.filesystem[1].checksum).toBe('sha256:app_db_orig_hash');
      expect(snapshot.capturedState.powerState).toBe('running');
      expect(snapshot.vmConfig.cpuCores).toBe(4);

      // 2. Extensively mutate live VM (simulate file corruption, new process, hardware upscale, and power crash)
      vm.currentState.powerState = 'crashed';
      vm.currentState.filesystem[1].checksum = 'sha256:corrupted_bitrot_junk';
      vm.currentState.filesystem.push({
        path: '/tmp/malicious.sh',
        checksum: 'sha256:badfile',
        sizeKb: 5,
        lastModifiedSimulated: '2026-10-11T13:00:00Z',
      });
      vm.currentState.processes.pop();
      vm.currentState.processes.push({
        pid: 999,
        name: 'crypto-miner',
        cpuPercent: 99.0,
        memoryMb: 4000,
        status: 'failed',
      });
      vm.hardware.cpuCores = 16;
      vm.hardware.memoryMb = 32768;

      // 3. Proves snapshot was NOT mutated by reference (no shallow copy leak)
      expect(snapshot.capturedState.powerState).toBe('running');
      expect(snapshot.capturedState.filesystem).toHaveLength(2);
      expect(snapshot.capturedState.filesystem[1].checksum).toBe('sha256:app_db_orig_hash');
      expect(snapshot.capturedState.processes).toHaveLength(2);
      expect(snapshot.capturedState.processes[0].name).toBe('nginx-ingress');
      expect(snapshot.vmConfig.cpuCores).toBe(4);
      expect(snapshot.vmConfig.memoryMb).toBe(8192);
    });
  });

  describe('2. State Recovery on Restore', () => {
    it('restores a snapshot and completely recovers the exact expected state without erasing the snapshot', () => {
      const vm = createMockVM();
      const { snapshot } = SnapshotEngine.createSnapshot(vm, {
        name: 'Golden Baseline',
      });

      // Break VM state: corrupt database file and halt VM
      vm.currentState.powerState = 'stopped';
      vm.currentState.filesystem[1].checksum = 'sha256:tampered_corrupted_data';
      vm.currentState.processes = [];

      // Restore snapshot
      const { restoredVM, recoveryAttempt, auditEvent } = SnapshotEngine.restoreSnapshot(
        snapshot,
        vm
      );

      // Proves expected state is fully recovered
      expect(restoredVM.currentState.powerState).toBe('running');
      expect(restoredVM.currentState.processes).toHaveLength(2);
      expect(restoredVM.currentState.processes[0].name).toBe('nginx-ingress');
      expect(restoredVM.currentState.filesystem[1].checksum).toBe('sha256:app_db_orig_hash');
      expect(restoredVM.activeSnapshotId).toBe(snapshot.id);

      // Verify recovery attempt and audit log
      expect(recoveryAttempt.status).toBe('succeeded');
      expect(recoveryAttempt.targetSnapshotId).toBe(snapshot.id);
      expect(recoveryAttempt.restoredChecksumMatch).toBe(true);
      expect(auditEvent.type).toBe('snapshot_restored');

      // Proves snapshot itself is intact and not erased
      expect(snapshot.capturedState.filesystem[1].checksum).toBe('sha256:app_db_orig_hash');
    });
  });

  describe('3. Idempotent Restoration (Restoring Twice)', () => {
    it('proves restoring twice produces identical state', () => {
      const vm = createMockVM();
      const { snapshot } = SnapshotEngine.createSnapshot(vm, {
        name: 'Snapshot For Idempotency Test',
      });

      // Modify VM
      vm.currentState.powerState = 'crashed';

      // First restore
      const firstResult = SnapshotEngine.restoreSnapshot(snapshot, vm);
      // Mutate intermediate restored VM
      firstResult.restoredVM.currentState.powerState = 'stopped';

      // Second restore
      const secondResult = SnapshotEngine.restoreSnapshot(snapshot, firstResult.restoredVM);

      expect(secondResult.restoredVM.currentState.powerState).toBe('running');
      expect(secondResult.restoredVM.currentState.filesystem).toEqual(
        snapshot.capturedState.filesystem
      );
      expect(secondResult.restoredVM.currentState.processes).toEqual(
        snapshot.capturedState.processes
      );
      expect(secondResult.restoredVM.hardware).toEqual(snapshot.vmConfig);
    });
  });

  describe('4. Incompatible and Invalid Snapshots are Rejected', () => {
    it('rejects restoring a snapshot to a different VM', () => {
      const vmAlpha = createMockVM('vm-alpha', 'Alpha Server');
      const vmBeta = createMockVM('vm-beta', 'Beta Server');

      const { snapshot } = SnapshotEngine.createSnapshot(vmAlpha, { name: 'Alpha Snapshot' });

      expect(() => {
        SnapshotEngine.restoreSnapshot(snapshot, vmBeta);
      }).toThrowError(SnapshotError);

      try {
        SnapshotEngine.restoreSnapshot(snapshot, vmBeta);
      } catch (err: unknown) {
        expect((err as SnapshotError).code).toBe('INCOMPATIBLE_SNAPSHOT');
        expect((err as SnapshotError).message).toContain("belongs to VM 'vm-alpha', not target VM 'vm-beta'");
      }
    });

    it('rejects snapshots with incompatible schema versions', () => {
      const vm = createMockVM();
      const { snapshot } = SnapshotEngine.createSnapshot(vm, { name: 'Schema Test' });

      // Simulate a future unsupported schema
      (snapshot as any).schemaVersion = '99.0';

      expect(() => {
        SnapshotEngine.restoreSnapshot(snapshot, vm);
      }).toThrowError(/Incompatible snapshot schema version '99.0'/i);
    });

    it('rejects snapshots with corrupted payloads', () => {
      const vm = createMockVM();
      const corruptedSnapshot: Snapshot = {
        id: 'snap-corrupt',
        vmId: vm.id,
        vmName: vm.name,
        parentSnapshotId: null,
        name: 'Broken Snapshot',
        description: '',
        createdAt: new Date().toISOString(),
        vmConfig: null as any, // missing hardware config
        capturedState: null as any,
        sizeBytes: 100,
        isConsistent: true,
        treeDepth: 0,
      };

      expect(() => {
        SnapshotEngine.restoreSnapshot(corruptedSnapshot, vm);
      }).toThrowError(/Corrupted snapshot payload/i);
    });
  });

  describe('5. Cross-VM Isolation', () => {
    it('proves restoring VM A leaves other VMs completely unaffected', () => {
      const vmA = createMockVM('vm-node-a', 'Node A');
      const vmB = createMockVM('vm-node-b', 'Node B');

      const { snapshot: snapA } = SnapshotEngine.createSnapshot(vmA, { name: 'Node A Snap' });

      // Modify VM A and VM B
      vmA.currentState.powerState = 'crashed';
      vmB.currentState.powerState = 'running';
      vmB.currentState.cpuUsagePercent = 77.7;
      vmB.currentState.processes = [
        { pid: 777, name: 'redis-custom', cpuPercent: 77.7, memoryMb: 4096, status: 'healthy' },
      ];

      // Restore VM A
      const { restoredVM: restoredA } = SnapshotEngine.restoreSnapshot(snapA, vmA);

      // Verify A is recovered
      expect(restoredA.currentState.powerState).toBe('running');

      // Verify B was untouched
      expect(vmB.id).toBe('vm-node-b');
      expect(vmB.currentState.cpuUsagePercent).toBe(77.7);
      expect(vmB.currentState.processes).toHaveLength(1);
      expect(vmB.currentState.processes[0].name).toBe('redis-custom');
    });
  });

  describe('6. Comparison Diff Calculation', () => {
    it('accurately identifies hardware, power, process, and file diffs between snapshot and live VM', () => {
      const vm = createMockVM();
      const { snapshot } = SnapshotEngine.createSnapshot(vm, { name: 'Baseline Diff' });

      // Initially no differences
      const initialDiff = SnapshotEngine.compareSnapshotWithVM(snapshot, vm);
      expect(initialDiff.hasAnyDifferences).toBe(false);

      // Introduce changes to live VM
      vm.currentState.powerState = 'paused';
      vm.hardware.cpuCores = 8; // changed hardware
      vm.currentState.processes.push({
        pid: 301,
        name: 'new-worker',
        cpuPercent: 5.0,
        memoryMb: 512,
        status: 'healthy',
      });
      vm.currentState.processes[0].cpuPercent = 55.0; // modified process
      vm.currentState.filesystem[0].checksum = 'sha256:new_config_hash'; // modified file
      vm.currentState.filesystem.push({
        path: '/var/log/new.log',
        checksum: 'sha256:new_log',
        sizeKb: 10,
        lastModifiedSimulated: '2026-10-11T14:00:00Z',
      }); // added file

      const updatedDiff = SnapshotEngine.compareSnapshotWithVM(snapshot, vm);
      expect(updatedDiff.hasAnyDifferences).toBe(true);
      expect(updatedDiff.powerStateDiff.changed).toBe(true);
      expect(updatedDiff.powerStateDiff.snapshot).toBe('running');
      expect(updatedDiff.powerStateDiff.current).toBe('paused');

      expect(updatedDiff.hardwareDiff.hasChanges).toBe(true);
      expect(updatedDiff.hardwareDiff.cpuCores.changed).toBe(true);
      expect(updatedDiff.hardwareDiff.cpuCores.snapshot).toBe(4);
      expect(updatedDiff.hardwareDiff.cpuCores.current).toBe(8);

      expect(updatedDiff.processesDiff.addedInCurrent).toHaveLength(1);
      expect(updatedDiff.processesDiff.addedInCurrent[0].name).toBe('new-worker');
      expect(updatedDiff.processesDiff.modified).toHaveLength(1);
      expect(updatedDiff.processesDiff.modified[0].process.name).toBe('nginx-ingress');

      expect(updatedDiff.filesystemDiff.addedInCurrent).toHaveLength(1);
      expect(updatedDiff.filesystemDiff.addedInCurrent[0].path).toBe('/var/log/new.log');
      expect(updatedDiff.filesystemDiff.modified).toHaveLength(1);
      expect(updatedDiff.filesystemDiff.modified[0].path).toBe('/etc/nginx/nginx.conf');
    });
  });
});
