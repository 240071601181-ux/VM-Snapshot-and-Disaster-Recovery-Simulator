import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

export const SimulatorBanner: React.FC = () => {
  return (
    <aside className="simulator-alert-banner" role="banner" aria-label="Simulator Notice">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <AlertTriangle size={16} aria-hidden="true" style={{ color: '#fca5a5', flexShrink: 0 }} />
        <span>
          <strong>SIMULATOR ACTIVE:</strong> All virtual machines, snapshots, disk blocks, and disaster-recovery drills are emulated entirely within browser memory and storage. No real hypervisors or host resources are used.
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <span className="simulator-badge-chip">
          <Info size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
          SYNTHETIC TELEMETRY
        </span>
      </div>
    </aside>
  );
};
