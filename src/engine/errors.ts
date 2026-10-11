/**
 * Domain error class for simulated Virtual Machine lifecycle operations.
 * Explicitly denotes in-browser simulator validation failures.
 */
export class VMLifecycleError extends Error {
  public readonly code: string;
  public readonly vmId?: string;

  constructor(message: string, code: string = 'LIFECYCLE_ERROR', vmId?: string) {
    super(message);
    this.name = 'VMLifecycleError';
    this.code = code;
    this.vmId = vmId;
    Object.setPrototypeOf(this, VMLifecycleError.prototype);
  }
}

export class SnapshotError extends VMLifecycleError {
  public readonly snapshotId?: string;

  constructor(message: string, code: string = 'SNAPSHOT_ERROR', snapshotId?: string, vmId?: string) {
    super(message, code, vmId);
    this.name = 'SnapshotError';
    this.snapshotId = snapshotId;
    Object.setPrototypeOf(this, SnapshotError.prototype);
  }
}
