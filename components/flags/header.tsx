"use client";

import React from "react";
import { Flag, Plus, Terminal, Activity, Database, ShieldAlert, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  totalFlags: number;
  activeFlagsCount: number;
  onOpenCreateModal: () => void;
  onOpenTesterModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  totalFlags,
  activeFlagsCount,
  onOpenCreateModal,
  onOpenTesterModal,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 p-[1px] shadow-lg shadow-blue-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
              <Flag className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white font-mono">
                FlagOps
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                v1.0-OSS
              </span>
            </div>
            <p className="text-[10px] text-slate-500 -mt-0.5 hidden sm:block">
              LaunchDarkly Open-Source Alternative
            </p>
          </div>
        </div>

        {/* Live Metrics Pills */}
        <div className="hidden md:flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">Total Flags:</span>
            <span className="font-bold text-white font-mono">{totalFlags}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-subtle" />
            <span className="text-slate-400">Active in Env:</span>
            <span className="font-bold text-emerald-400 font-mono">{activeFlagsCount}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">SSE Stream:</span>
            <span className="font-mono text-cyan-400 font-semibold">Active</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800">
            <Database className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Engine:</span>
            <span className="font-mono text-slate-300">Murmur3 (32b)</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenTesterModal}
            className="hidden sm:inline-flex"
          >
            <Terminal className="w-3.5 h-3.5 mr-1 text-slate-400" />
            SDK Simulator
          </Button>

          <Button variant="primary" size="sm" onClick={onOpenCreateModal}>
            <Plus className="w-4 h-4 mr-1" />
            New Feature Flag
          </Button>
        </div>
      </div>
    </header>
  );
};
