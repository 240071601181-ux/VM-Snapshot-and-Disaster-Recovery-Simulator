import React from 'react';
import {
  LayoutDashboard,
  Server,
  Camera,
  Activity,
  History,
  ShieldCheck,
} from 'lucide-react';
import { NavView } from '../../types';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  vmCount: number;
  snapshotCount: number;
  activityCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  vmCount,
  snapshotCount,
  activityCount,
}) => {
  const navItems: { id: NavView; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'dashboard',
      label: 'Overview',
      icon: <LayoutDashboard size={18} />,
    },
    {
      id: 'vms',
      label: 'Virtual Machines',
      icon: <Server size={18} />,
      badge: vmCount,
    },
    {
      id: 'snapshots',
      label: 'Snapshot History',
      icon: <Camera size={18} />,
      badge: snapshotCount,
    },
    {
      id: 'dr-metrics',
      label: 'DR & Recovery SLA',
      icon: <ShieldCheck size={18} />,
    },
    {
      id: 'activity',
      label: 'Audit Activity',
      icon: <History size={18} />,
      badge: activityCount,
    },
  ];

  return (
    <aside className="sidebar" aria-label="Main Navigation">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <Activity size={20} />
          </div>
          <div>
            <div className="brand-title">SIM-HYPERVISOR</div>
            <div className="brand-subtitle">DISASTER RECOVERY</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              data-testid={`nav-${item.id}`}
            >
              <div className="nav-link-content">
                {item.icon}
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className="nav-badge" data-testid={`nav-badge-${item.id}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="simulator-meta-card">
          <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 2 }}>
            Simulated Sandbox
          </div>
          <div>VBox / KVM / Hyper-V emulation layer: <strong>Inactive</strong></div>
          <div style={{ marginTop: 4, color: 'var(--color-brand)' }}>
            100% In-Browser State Engine
          </div>
        </div>
      </div>
    </aside>
  );
};
