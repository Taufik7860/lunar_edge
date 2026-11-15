import React from 'react';
import { WorkspaceId } from '../../types/api';
import { Check, Settings, Compass, BarChart3, ShieldCheck, RotateCcw } from 'lucide-react';

interface WorkflowStepperProps {
  activeWorkspace: WorkspaceId;
  onSelectWorkspace: (ws: WorkspaceId) => void;
  onOpenConfigModal: () => void;
  hasRunDiscovery: boolean;
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  activeWorkspace,
  onSelectWorkspace,
  onOpenConfigModal,
  hasRunDiscovery,
}) => {
  const steps: Array<{
    id: WorkspaceId | 'config';
    num: number;
    title: string;
    action: () => void;
    isActive: boolean;
    isCompleted: boolean;
  }> = [
    {
      id: 'config',
      num: 1,
      title: 'Configure Mission',
      action: onOpenConfigModal,
      isActive: false,
      isCompleted: hasRunDiscovery,
    },
    {
      id: 'discovery',
      num: 2,
      title: 'Discover Opportunities',
      action: () => onSelectWorkspace('discovery'),
      isActive: activeWorkspace === 'discovery',
      isCompleted: hasRunDiscovery,
    },
    {
      id: 'intelligence',
      num: 3,
      title: 'Compare Candidates',
      action: () => onSelectWorkspace('intelligence'),
      isActive: activeWorkspace === 'intelligence',
      isCompleted: false,
    },
    {
      id: 'resilience',
      num: 4,
      title: 'Evaluate Resilience',
      action: () => onSelectWorkspace('resilience'),
      isActive: activeWorkspace === 'resilience',
      isCompleted: false,
    },
    {
      id: 'recovery',
      num: 5,
      title: 'Plan Recovery',
      action: () => onSelectWorkspace('recovery'),
      isActive: activeWorkspace === 'recovery',
      isCompleted: false,
    },
  ];

  return (
    <div className="h-10 bg-obsidian-950/95 border-b border-slate-800/80 px-6 flex items-center justify-center select-none z-20 backdrop-blur-md">
      <div className="flex items-center space-x-2 sm:space-x-6 max-w-4xl w-full justify-between">
        {steps.map((step, idx) => {
          return (
            <React.Fragment key={step.num}>
              <button
                onClick={step.action}
                className="flex items-center space-x-2 group focus:outline-none transition-all"
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold transition-all ${
                    step.isActive
                      ? 'bg-cyan-500 text-obsidian-950 ring-4 ring-cyan-500/20 shadow-cyan-glow'
                      : step.isCompleted
                      ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-400'
                      : 'bg-graphite-900 border border-slate-700 text-slate-400 group-hover:border-slate-500 group-hover:text-slate-200'
                  }`}
                >
                  {step.isCompleted && !step.isActive ? (
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  ) : (
                    step.num
                  )}
                </div>
                <span
                  className={`text-xs font-mono tracking-tight transition-colors hidden md:inline ${
                    step.isActive
                      ? 'text-cyan-300 font-bold'
                      : step.isCompleted
                      ? 'text-slate-200 font-medium'
                      : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                >
                  {step.title}
                </span>
              </button>

              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-px transition-colors ${
                    step.isCompleted ? 'bg-cyan-500/50' : 'bg-slate-800'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
