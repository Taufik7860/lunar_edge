import React from 'react';
import { WorkspaceId } from '../../types/api';
import {
  Globe,
  Crosshair,
  BarChart3,
  Shield,
  RotateCw,
} from 'lucide-react';

interface SidebarNavProps {
  activeWorkspace: WorkspaceId;
  onSelectWorkspace: (ws: WorkspaceId) => void;
  candidateCount?: number;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeWorkspace,
  onSelectWorkspace,
}) => {
  const workspaces: Array<{
    id: WorkspaceId;
    title: string;
    sub: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'explorer',
      title: 'Mission Explorer',
      sub: 'Explore the lunar environment',
      icon: Globe,
    },
    {
      id: 'discovery',
      title: 'Opportunity Discovery',
      sub: 'Find optimal landing regions',
      icon: Crosshair,
    },
    {
      id: 'intelligence',
      title: 'Candidate Intelligence',
      sub: 'Analyze & compare',
      icon: BarChart3,
    },
    {
      id: 'resilience',
      title: 'Mission Resilience',
      sub: 'Assess uncertainties',
      icon: Shield,
    },
    {
      id: 'recovery',
      title: 'Mission Recovery',
      sub: 'Explore alternatives',
      icon: RotateCw,
    },
  ];

  return (
    <aside className="w-64 bg-obsidian-950/90 border-r border-slate-800/80 flex flex-col justify-between z-20 select-none p-3 backdrop-blur-md">
      <div className="space-y-2">
        {workspaces.map((ws) => {
          const isActive = activeWorkspace === ws.id;
          const Icon = ws.icon;

          return (
            <button
              key={ws.id}
              onClick={() => onSelectWorkspace(ws.id)}
              className={`w-full text-left p-3 rounded-xl transition-all flex items-center space-x-3 group relative border ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900/60 border-cyan-500/60 text-white shadow-cyan-glow'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <div
                className={`p-2 rounded-lg transition-all ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40'
                    : 'bg-graphite-900/80 text-slate-400 group-hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div
                  className={`font-sans text-xs font-bold tracking-tight truncate ${
                    isActive ? 'text-white' : 'text-slate-300'
                  }`}
                >
                  {ws.title}
                </div>
                <div className="text-[10px] font-sans text-slate-500 tracking-tight truncate mt-0.5">
                  {ws.sub}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
