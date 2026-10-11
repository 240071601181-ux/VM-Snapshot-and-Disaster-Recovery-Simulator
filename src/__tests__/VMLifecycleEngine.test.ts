import { describe, it, expect, beforeEach } from 'vitest';
import { VMLifecycleEngine } from '../engine/VMLifecycleEngine';
import { VMLifecycleError } from '../engine/errors';
import { VirtualMachine } from '../types';

describe('VMLifecycleEngine Domain Engine', () => {
  let engine: VMLifecycleEngine;

  const sampleVM: VirtualMachine = {
    id: 'vm-test-1',
    name: 'test-server',
    description: 'Unit test simulated VM',
    os: 'Ubuntu 24.04 LTS',
    environment: 'staging',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hardware: {
      cpuCores: 4,
      memoryMb: 8192,
      diskSizeGb: 100,
    },
    currentState: {
      powerState: 'stopped',
      osName: 'Ubuntu 24.04 LTS',
      kernelStatus: 'ok',
      simulatedUptimeSeconds: 0,
      cpuUsagePercent: 0,
      memoryUsageMb: 0,
      network: {
        ipAddress: '10.0.1.10',
        connected: false,
        rxPackets: 0,
        txPackets: 0,
      },
      processes: [],
      filesystem: [
        {
          path: '/etc/hosts',
          checksum: 'abc123hash',
          sizeKb: 1,
          lastModifiedSimulated: new Date().toISOString(),
        },
      ],
    },
    activeSnapshotId: null,
    snapshotCount: 0,
  };

  beforeEach(() => {
    engine = new VMLifecycleEngine([sampleVM]);
  });

  describe('Creation & Validation', () => {
    it('creates a new simulated VM with default stopped state', () => {
      const vm = engine.createVM({
        name: 'web-worker-01',
        os: 'Debian 12 Bookworm',
        environment: 'production',
        hardware: {
          cpuCores: 2,
          memoryMb: 4096,
          diskSizeGb: 80,
        },
      });

      expect(vm.id).toBeDefined();
      expect(vm.name).toBe('web-worker-01');
      expect(vm.currentState.powerState).toBe('stopped');
      expect(vm.currentState.processes).toHaveLength(0);
      expect(vm.currentState.filesystem.length).toBeGreaterThan(0);
      expect(vm.currentState.network.ipAddress).toMatch(/^10\.0\./);
    });

    it('rejects duplicate VM IDs with a meaningful VMLifecycleError', () => {
      expect(() => {
        engine.createVM({
          id: 'vm-test-1', // already exists
          name: 'duplicate-vm',
          os: 'Ubuntu 24.04 LTS',
          environment: 'development',
          hardware: { cpuCores: 2, memoryMb: 2048, diskSizeGb: 50 },
        });
      }).toThrowError(VMLifecycleError);

      try {
        engine.createVM({
          id: 'vm-test-1',
          name: 'duplicate-vm',
          os: 'Ubuntu 24.04 LTS',
          environment: 'development',
          hardware: { cpuCores: 2, memoryMb: 2048, diskSizeGb: 50 },
        });
      } catch (err: unknown) {
        expect((err as VMLifecycleError).code).toBe('DUPLICATE_ID');
        expect((err as VMLifecycleError).message).toContain("already exists in simulator memory");
      }
    });

    it('rejects blank VM name', () => {
      expect(() => {
        engine.createVM({
          name: '   ',
          os: 'Ubuntu 24.04 LTS',
          environment: 'development',
          hardware: { cpuCores: 2, memoryMb: 2048, diskSizeGb: 50 },
        });
      }).toThrowError(/Virtual machine display name cannot be blank/i);
    });

    it('validates hardware boundaries', () => {
      expect(() => {
        engine.createVM({
          name: 'invalid-hardware',
          os: 'Ubuntu',
          environment: 'development',
          hardware: { cpuCores: 0, memoryMb: 2048, diskSizeGb: 50 },
        });
      }).toThrowError(/Simulated CPU cores must be between 1 and 128/i);

      expect(() => {
        engine.createVM({
          name: 'invalid-ram',
          os: 'Ubuntu',
          environment: 'development',
          hardware: { cpuCores: 2, memoryMb: 256, diskSizeGb: 50 },
        });
      }).toThrowError(/Simulated memory must be between 512 MB and 512 GB/i);
    });
  });

  describe('Valid Lifecycle Transitions', () => {
    it('starts a stopped VM (stopped -> running)', () => {
      const runningVM = engine.startVM('vm-test-1');
      expect(runningVM.currentState.powerState).toBe('running');
      expect(runningVM.currentState.network.connected).toBe(true);
      expect(runningVM.currentState.processes.length).toBeGreaterThan(0);
      expect(runningVM.currentState.cpuUsagePercent).toBeGreaterThan(0);
    });

    it('stops a running VM (running -> stopped)', () => {
      engine.startVM('vm-test-1');
      const stoppedVM = engine.stopVM('vm-test-1');
      expect(stoppedVM.currentState.powerState).toBe('stopped');
      expect(stoppedVM.currentState.network.connected).toBe(false);
      expect(stoppedVM.currentState.processes).toHaveLength(0);
      expect(stoppedVM.currentState.cpuUsagePercent).toBe(0);
    });

    it('restarts a running VM (running -> restart -> running)', () => {
      engine.startVM('vm-test-1');
      const restartedVM = engine.restartVM('vm-test-1');
      expect(restartedVM.currentState.powerState).toBe('running');
      expect(restartedVM.currentState.network.connected).toBe(true);
      expect(restartedVM.currentState.processes.length).toBeGreaterThan(0);
    });

    it('pauses and resumes a VM (running -> paused -> running)', () => {
      engine.startVM('vm-test-1');
      const pausedVM = engine.pauseVM('vm-test-1');
      expect(pausedVM.currentState.powerState).toBe('paused');

      const resumedVM = engine.resumeVM('vm-test-1');
      expect(resumedVM.currentState.powerState).toBe('running');
    });
  });

  describe('Invalid Lifecycle Transitions & Meaningful Errors', () => {
    it('rejects starting an already running VM', () => {
      engine.startVM('vm-test-1');
      expect(() => {
        engine.startVM('vm-test-1');
      }).toThrowError(/already running/i);
    });

    it('rejects stopping an already stopped VM', () => {
      expect(() => {
        engine.stopVM('vm-test-1');
      }).toThrowError(/already stopped/i);
    });

    it('rejects restarting a stopped VM', () => {
      expect(() => {
        engine.restartVM('vm-test-1');
      }).toThrowError(/Cannot restart stopped virtual machine/i);
    });

    it('rejects pausing a stopped VM', () => {
      expect(() => {
        engine.pauseVM('vm-test-1');
      }).toThrowError(/Only running VMs can be paused/i);
    });

    it('rejects operations on a non-existent VM ID', () => {
      expect(() => {
        engine.startVM('non-existent-vm-999');
      }).toThrowError(/Virtual machine with ID 'non-existent-vm-999' was not found/i);
    });
  });

  describe('Deletion & Confirmation Behavior', () => {
    it('deletes VM when exact confirmation name is provided', () => {
      const result = engine.deleteVM('vm-test-1', 'test-server');
      expect(result).toBe(true);

      expect(() => engine.getVM('vm-test-1')).toThrowError(/not found in simulator memory/i);
    });

    it('rejects deletion when confirmation name does not match', () => {
      expect(() => {
        engine.deleteVM('vm-test-1', 'wrong-name');
      }).toThrowError(/Deletion confirmation failed: Expected confirmation name 'test-server' but received 'wrong-name'/i);

      // Verify VM still exists
      expect(engine.getVM('vm-test-1')).toBeDefined();
    });

    it('rejects deletion of non-existent VM', () => {
      expect(() => {
        engine.deleteVM('ghost-vm', 'ghost-vm');
      }).toThrowError(/was not found in simulator memory/i);
    });
  });

  describe('Audit Logging', () => {
    it('records audit events for creation, state changes, and deletion', () => {
      engine.startVM('vm-test-1');
      engine.stopVM('vm-test-1');
      const events = engine.getAuditEvents();
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].title).toContain('VM Stopped');
      expect(events[1].title).toContain('VM Started');
    });
  });
});
