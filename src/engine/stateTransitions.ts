import { VMExecutionState } from '../types';
import { VMLifecycleError } from './errors';

export type LifecycleAction = 'start' | 'stop' | 'restart' | 'pause' | 'resume';

/**
 * Valid state transitions mapping for simulated VMs.
 * Note: These are simulated lifecycle transitions in browser memory only.
 */
export const VALID_TRANSITIONS: Record<VMExecutionState, Partial<Record<LifecycleAction, VMExecutionState>>> = {
  stopped: {
    start: 'running',
  },
  running: {
    stop: 'stopped',
    restart: 'running',
    pause: 'paused',
  },
  paused: {
    resume: 'running',
    stop: 'stopped',
  },
  crashed: {
    stop: 'stopped', // Cold reset cleans up crashed memory
  },
  corrupted: {
    stop: 'stopped', // Force halt corrupted instance
  },
};

/**
 * Validates a lifecycle action against the current VM execution state.
 * Throws a meaningful VMLifecycleError if the requested transition is illegal.
 */
export function validateStateTransition(
  currentState: VMExecutionState,
  action: LifecycleAction,
  vmName: string,
  vmId: string
): VMExecutionState {
  const allowedTransitions = VALID_TRANSITIONS[currentState];
  const targetState = allowedTransitions ? allowedTransitions[action] : undefined;

  if (!targetState) {
    let explanation = '';
    switch (action) {
      case 'start':
        explanation = currentState === 'running'
          ? `Virtual machine '${vmName}' is already running.`
          : `Cannot start virtual machine '${vmName}' from state '${currentState}'.`;
        break;
      case 'stop':
        explanation = currentState === 'stopped'
          ? `Virtual machine '${vmName}' is already stopped.`
          : `Cannot stop virtual machine '${vmName}' from state '${currentState}'.`;
        break;
      case 'restart':
        explanation = currentState === 'stopped'
          ? `Cannot restart stopped virtual machine '${vmName}'. Start it instead.`
          : `Cannot restart virtual machine '${vmName}' from state '${currentState}'.`;
        break;
      case 'pause':
        explanation = `Cannot pause virtual machine '${vmName}' from state '${currentState}'. Only running VMs can be paused.`;
        break;
      case 'resume':
        explanation = `Cannot resume virtual machine '${vmName}' from state '${currentState}'. Only paused VMs can be resumed.`;
        break;
      default:
        explanation = `Action '${action}' is not permitted for virtual machine '${vmName}' in state '${currentState}'.`;
    }

    throw new VMLifecycleError(
      `Invalid simulated state transition: ${explanation} (Simulated Hypervisor Rule)`,
      'INVALID_TRANSITION',
      vmId
    );
  }

  return targetState;
}
