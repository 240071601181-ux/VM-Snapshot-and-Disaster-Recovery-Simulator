import {
  VirtualMachine,
  VMExecutionState,
  AuditEvent,
  AuditEventType,
  SimulatedWorkloadProcess,
  SimulatedFilesystemEntry,
} from '../types';
import { VMLifecycleError } from './errors';
import { validateStateTransition } from './stateTransitions';

export interface CreateVMOptions {
  id?: string;
  name: string;
  description?: string;
  os: string;
  environment: 'production' | 'staging' | 'development';
  hardware: {
    cpuCores: number;
    memoryMb: number;
    diskSizeGb: number;
  };
  initialState?: VMExecutionState;
}

/**
 * Pure TypeScript In-Browser Virtual Machine Simulation Engine.
 *
 * CRITICAL SIMULATION BOUNDARY NOTICE:
 * This engine operates 100% inside browser memory. It does NOT invoke
 * VirtualBox, VMware, KVM, Docker, or native host hypervisors.
 * All lifecycle states, virtual CPU/RAM usage, guest processes, and disk inodes
 * are purely simulated data structures.
 */
export class VMLifecycleEngine {
  private vms: Map<string, VirtualMachine> = new Map();
  private auditEvents: AuditEvent[] = [];
  private ipSubnetCounter = 50;

  constructor(initialVMs?: VirtualMachine[]) {
    if (initialVMs && initialVMs.length > 0) {
      initialVMs.forEach((vm) => {
        // Deep clone to ensure engine owns state
        this.vms.set(vm.id, JSON.parse(JSON.stringify(vm)));
      });
    }
  }

  /**
   * Generates default guest processes appropriate for simulated OS.
   */
  private generateDefaultProcesses(os: string): SimulatedWorkloadProcess[] {
    const isWindows = os.toLowerCase().includes('windows');
    if (isWindows) {
      return [
        { pid: 4, name: 'System', cpuPercent: 1.2, memoryMb: 120, status: 'healthy' },
        { pid: 412, name: 'smss.exe', cpuPercent: 0.1, memoryMb: 14, status: 'healthy' },
        { pid: 620, name: 'services.exe', cpuPercent: 0.4, memoryMb: 36, status: 'healthy' },
        { pid: 884, name: 'lsass.exe', cpuPercent: 0.8, memoryMb: 52, status: 'healthy' },
        { pid: 1024, name: 'svchost.exe', cpuPercent: 1.8, memoryMb: 180, status: 'healthy' },
      ];
    }

    return [
      { pid: 1, name: 'systemd', cpuPercent: 0.5, memoryMb: 38, status: 'healthy' },
      { pid: 142, name: 'systemd-journald', cpuPercent: 0.2, memoryMb: 24, status: 'healthy' },
      { pid: 288, name: 'systemd-networkd', cpuPercent: 0.1, memoryMb: 18, status: 'healthy' },
      { pid: 410, name: 'sshd', cpuPercent: 0.1, memoryMb: 16, status: 'healthy' },
      { pid: 850, name: 'cron', cpuPercent: 0.05, memoryMb: 12, status: 'healthy' },
    ];
  }

  /**
   * Generates baseline simulated filesystem inodes with deterministic SHA-256 hashes.
   */
  private generateDefaultFilesystem(os: string): SimulatedFilesystemEntry[] {
    const now = new Date().toISOString();
    const isWindows = os.toLowerCase().includes('windows');

    if (isWindows) {
      return [
        { path: 'C:\\Windows\\System32\\ntoskrnl.exe', checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', sizeKb: 10240, lastModifiedSimulated: now },
        { path: 'C:\\Windows\\System32\\drivers\\etc\\hosts', checksum: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', sizeKb: 1, lastModifiedSimulated: now },
        { path: 'C:\\ProgramData\\Application\\config.json', checksum: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a', sizeKb: 4, lastModifiedSimulated: now },
      ];
    }

    return [
      { path: '/etc/os-release', checksum: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0', sizeKb: 1, lastModifiedSimulated: now },
      { path: '/etc/hostname', checksum: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3', sizeKb: 1, lastModifiedSimulated: now },
      { path: '/etc/hosts', checksum: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4', sizeKb: 1, lastModifiedSimulated: now },
      { path: '/var/log/syslog', checksum: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5', sizeKb: 45, lastModifiedSimulated: now },
    ];
  }

  /**
   * Creates a new simulated Virtual Machine.
   * Validates duplicate ID and hardware constraints.
   */
  public createVM(options: CreateVMOptions): VirtualMachine {
    const id = options.id || `vm-${Math.random().toString(36).substring(2, 9)}`;

    if (this.vms.has(id)) {
      throw new VMLifecycleError(
        `A virtual machine with ID '${id}' already exists in simulator memory.`,
        'DUPLICATE_ID',
        id
      );
    }

    if (!options.name || options.name.trim().length === 0) {
      throw new VMLifecycleError(
        'Virtual machine display name cannot be blank.',
        'INVALID_NAME'
      );
    }

    if (options.hardware.cpuCores < 1 || options.hardware.cpuCores > 128) {
      throw new VMLifecycleError(
        'Simulated CPU cores must be between 1 and 128.',
        'INVALID_HARDWARE'
      );
    }

    if (options.hardware.memoryMb < 512 || options.hardware.memoryMb > 524288) {
      throw new VMLifecycleError(
        'Simulated memory must be between 512 MB and 512 GB.',
        'INVALID_HARDWARE'
      );
    }

    if (options.hardware.diskSizeGb < 10 || options.hardware.diskSizeGb > 16384) {
      throw new VMLifecycleError(
        'Simulated disk size must be between 10 GB and 16 TB.',
        'INVALID_HARDWARE'
      );
    }

    const now = new Date().toISOString();
    const powerState: VMExecutionState = options.initialState || 'stopped';
    const isRunning = powerState === 'running';

    this.ipSubnetCounter += 1;
    const ipAddress = `10.0.${Math.floor(this.ipSubnetCounter / 250)}.${(this.ipSubnetCounter % 250) + 2}`;

    const newVM: VirtualMachine = {
      id,
      name: options.name.trim(),
      description: options.description?.trim() || `Simulated ${options.os} virtual machine instance`,
      os: options.os,
      environment: options.environment,
      createdAt: now,
      updatedAt: now,
      hardware: {
        cpuCores: options.hardware.cpuCores,
        memoryMb: options.hardware.memoryMb,
        diskSizeGb: options.hardware.diskSizeGb,
      },
      currentState: {
        powerState,
        osName: options.os,
        kernelStatus: 'ok',
        simulatedUptimeSeconds: isRunning ? 60 : 0,
        cpuUsagePercent: isRunning ? 2.5 : 0,
        memoryUsageMb: isRunning ? Math.round(options.hardware.memoryMb * 0.15) : 0,
        network: {
          ipAddress,
          connected: isRunning,
          rxPackets: isRunning ? 120 : 0,
          txPackets: isRunning ? 95 : 0,
        },
        processes: isRunning ? this.generateDefaultProcesses(options.os) : [],
        filesystem: this.generateDefaultFilesystem(options.os),
      },
      activeSnapshotId: null,
      snapshotCount: 0,
    };

    this.vms.set(id, newVM);

    this.recordAuditEvent({
      type: 'vm_created',
      severity: 'info',
      title: `VM Created: ${newVM.name}`,
      details: `Provisioned simulated ${newVM.os} (${newVM.hardware.cpuCores} vCPU, ${newVM.hardware.memoryMb}MB RAM, ${newVM.hardware.diskSizeGb}GB Disk) in state '${powerState}'.`,
      vmId: newVM.id,
      vmName: newVM.name,
    });

    return JSON.parse(JSON.stringify(newVM));
  }

  /**
   * Retrieves a VM by ID or throws if not found.
   */
  public getVM(id: string): VirtualMachine {
    const vm = this.vms.get(id);
    if (!vm) {
      throw new VMLifecycleError(
        `Virtual machine with ID '${id}' was not found in simulator memory.`,
        'VM_NOT_FOUND',
        id
      );
    }
    return JSON.parse(JSON.stringify(vm));
  }

  /**
   * Returns deep clones of all simulated VMs.
   */
  public getAllVMs(): VirtualMachine[] {
    return Array.from(this.vms.values()).map((vm) => JSON.parse(JSON.stringify(vm)));
  }

  /**
   * Transitions a simulated VM from stopped/paused to running.
   */
  public startVM(id: string): VirtualMachine {
    const vm = this.vms.get(id);
    if (!vm) {
      throw new VMLifecycleError(`Virtual machine with ID '${id}' was not found.`, 'VM_NOT_FOUND', id);
    }

    const nextState = validateStateTransition(vm.currentState.powerState, 'start', vm.name, id);
    const now = new Date().toISOString();
    const os = vm.currentState.osName || vm.os || 'Ubuntu 24.04 LTS';

    vm.currentState.powerState = nextState;
    vm.currentState.cpuUsagePercent = Math.floor(Math.random() * 15) + 5;
    vm.currentState.memoryUsageMb = Math.round(vm.hardware.memoryMb * 0.25);
    vm.currentState.network.connected = true;
    vm.currentState.processes = this.generateDefaultProcesses(os);
    vm.updatedAt = now;

    this.recordAuditEvent({
      type: 'vm_power_changed',
      severity: 'info',
      title: `VM Started: ${vm.name}`,
      details: `Simulated guest booted with ${vm.currentState.processes.length} initial processes. Assigned IP: ${vm.currentState.network.ipAddress}.`,
      vmId: vm.id,
      vmName: vm.name,
    });

    return JSON.parse(JSON.stringify(vm));
  }

  /**
   * Transitions a simulated VM to stopped state.
   */
  public stopVM(id: string): VirtualMachine {
    const vm = this.vms.get(id);
    if (!vm) {
      throw new VMLifecycleError(`Virtual machine with ID '${id}' was not found.`, 'VM_NOT_FOUND', id);
    }

    const nextState = validateStateTransition(vm.currentState.powerState, 'stop', vm.name, id);
    const now = new Date().toISOString();

    vm.currentState.powerState = nextState;
    vm.currentState.cpuUsagePercent = 0;
    vm.currentState.memoryUsageMb = 0;
    vm.currentState.network.connected = false;
    vm.currentState.processes = [];
    vm.updatedAt = now;

    this.recordAuditEvent({
      type: 'vm_power_changed',
      severity: 'warning',
      title: `VM Stopped: ${vm.name}`,
      details: 'Simulated CPU halted, memory cleared, and network interface disconnected.',
      vmId: vm.id,
      vmName: vm.name,
    });

    return JSON.parse(JSON.stringify(vm));
  }

  /**
   * Simulates a cold reboot cycle for a running VM.
   */
  public restartVM(id: string): VirtualMachine {
    const vm = this.vms.get(id);
    if (!vm) {
      throw new VMLifecycleError(`Virtual machine with ID '${id}' was not found.`, 'VM_NOT_FOUND', id);
    }

    const nextState = validateStateTransition(vm.currentState.powerState, 'restart', vm.name, id);
    const now = new Date().toISOString();
    const os = vm.currentState.osName || vm.os || 'Ubuntu 24.04 LTS';

    vm.currentState.powerState = nextState;
    vm.currentState.cpuUsagePercent = Math.floor(Math.random() * 20) + 8;
    vm.currentState.memoryUsageMb = Math.round(vm.hardware.memoryMb * 0.22);
    vm.currentState.network.connected = true;
    vm.currentState.processes = this.generateDefaultProcesses(os);
    vm.updatedAt = now;

    this.recordAuditEvent({
      type: 'vm_power_changed',
      severity: 'info',
      title: `VM Restarted: ${vm.name}`,
      details: 'Simulated reboot sequence completed. Guest processes re-initialized.',
      vmId: vm.id,
      vmName: vm.name,
    });

    return JSON.parse(JSON.stringify(vm));
  }

  /**
   * Pauses execution of a running VM.
   */
  public pauseVM(id: string): VirtualMachine {
    const vm = this.vms.get(id);
    if (!vm) {
      throw new VMLifecycleError(`Virtual machine with ID '${id}' was not found.`, 'VM_NOT_FOUND', id);
    }

    const nextState = validateStateTransition(vm.currentState.powerState, 'pause', vm.name, id);
    const now = new Date().toISOString();

    vm.currentState.powerState = nextState;
    vm.currentState.cpuUsagePercent = 0;
    vm.updatedAt = now;

    this.recordAuditEvent({
      type: 'vm_power_changed',
      severity: 'warning',
      title: `VM Paused: ${vm.name}`,
      details: 'Guest CPU clock frozen in simulated memory.',
      vmId: vm.id,
      vmName: vm.name,
    });

    return JSON.parse(JSON.stringify(vm));
  }

  /**
   * Resumes execution of a paused VM.
   */
  public resumeVM(id: string): VirtualMachine {
    const vm = this.vms.get(id);
    if (!vm) {
      throw new VMLifecycleError(`Virtual machine with ID '${id}' was not found.`, 'VM_NOT_FOUND', id);
    }

    const nextState = validateStateTransition(vm.currentState.powerState, 'resume', vm.name, id);
    const now = new Date().toISOString();

    vm.currentState.powerState = nextState;
    vm.currentState.cpuUsagePercent = 5.2;
    vm.updatedAt = now;

    this.recordAuditEvent({
      type: 'vm_power_changed',
      severity: 'info',
      title: `VM Resumed: ${vm.name}`,
      details: 'Guest CPU execution unpaused in simulated memory.',
      vmId: vm.id,
      vmName: vm.name,
    });

    return JSON.parse(JSON.stringify(vm));
  }

  /**
   * Deletes a simulated VM with confirmation protection.
   * The confirmationName must strictly match the VM's display name.
   */
  public deleteVM(id: string, confirmationName: string): boolean {
    const vm = this.vms.get(id);
    if (!vm) {
      throw new VMLifecycleError(
        `Virtual machine with ID '${id}' was not found in simulator memory.`,
        'VM_NOT_FOUND',
        id
      );
    }

    if (confirmationName.trim() !== vm.name) {
      throw new VMLifecycleError(
        `Deletion confirmation failed: Expected confirmation name '${vm.name}' but received '${confirmationName}'.`,
        'CONFIRMATION_MISMATCH',
        id
      );
    }

    this.vms.delete(id);

    this.recordAuditEvent({
      type: 'vm_deleted',
      severity: 'warning',
      title: `VM Deleted: ${vm.name}`,
      details: `Virtual machine ${vm.name} (${id}) and all simulated volatile memory were destroyed.`,
      vmId: vm.id,
      vmName: vm.name,
    });

    return true;
  }

  /**
   * Internal helper to record chronological audit events.
   */
  private recordAuditEvent(event: {
    type: AuditEventType;
    severity: 'info' | 'warning' | 'error' | 'success';
    title: string;
    details: string;
    vmId?: string;
    vmName?: string;
  }): void {
    const audit: AuditEvent = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      operator: 'ops-simulator-admin',
      ...event,
    };
    this.auditEvents.unshift(audit);
  }

  /**
   * Returns chronological audit events captured by this engine instance.
   */
  public getAuditEvents(): AuditEvent[] {
    return JSON.parse(JSON.stringify(this.auditEvents));
  }
}
