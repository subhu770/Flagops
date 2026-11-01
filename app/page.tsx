"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Project, Environment } from "@prisma/client";
import { FeatureFlagWithRules } from "@/lib/types";
import { Header } from "@/components/flags/header";
import { ProjectEnvSwitcher } from "@/components/flags/project-env-switcher";
import { FlagList } from "@/components/flags/flag-list";
import { FlagEditorModal } from "@/components/flags/flag-editor-modal";
import { CreateFlagModal } from "@/components/flags/create-flag-modal";
import { SdkTesterModal } from "@/components/flags/sdk-tester-modal";
import { Terminal, Shield, RefreshCw, Cpu } from "lucide-react";

interface ProjectWithEnvs extends Project {
  environments: Environment[];
  _count?: { flags: number };
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectWithEnvs[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectWithEnvs | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);
  const [flags, setFlags] = useState<FeatureFlagWithRules[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTesterModalOpen, setIsTesterModalOpen] = useState(false);
  const [testerFlagKey, setTesterFlagKey] = useState<string>("");
  const [editingFlag, setEditingFlag] = useState<FeatureFlagWithRules | null>(null);

  // Fetch projects on initial mount
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      const data: ProjectWithEnvs[] = await res.json();
      setProjects(data);

      // Select default project if none selected yet
      if (data.length > 0 && !selectedProject) {
        const defaultProj = data[0];
        setSelectedProject(defaultProj);
        if (defaultProj.environments?.length > 0) {
          // Prefer Production environment as default
          const prodEnv =
            defaultProj.environments.find((e) =>
              e.name.toLowerCase().includes("prod")
            ) || defaultProj.environments[0];
          setSelectedEnvironment(prodEnv);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [selectedProject]);

  // Fetch flags for selected project & environment
  const fetchFlags = useCallback(async () => {
    if (!selectedProject || !selectedEnvironment) return;

    try {
      setIsLoading(true);
      const res = await fetch(
        `/api/flags?projectId=${selectedProject.id}&environmentId=${selectedEnvironment.id}`
      );
      if (!res.ok) throw new Error("Failed to load flags");
      const data = await res.json();
      setFlags(data);

      // If we are currently editing a flag, update its instance so the modal stays in sync
      if (editingFlag) {
        const updated = data.find((f: FeatureFlagWithRules) => f.id === editingFlag.id);
        if (updated) setEditingFlag(updated);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject, selectedEnvironment, editingFlag]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (selectedProject && selectedEnvironment) {
      fetchFlags();
    }
  }, [selectedProject, selectedEnvironment]);

  // Refresh handler
  const handleRefresh = () => {
    fetchProjects();
    fetchFlags();
  };

  const activeFlagsCount = flags.filter((f) => {
    const rule = f.targetingRules.find((r) => r.environmentId === selectedEnvironment?.id);
    return rule?.enabled ?? false;
  }).length;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Platform Header */}
      <Header
        totalFlags={flags.length}
        activeFlagsCount={activeFlagsCount}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onOpenTesterModal={() => {
          setTesterFlagKey(flags[0]?.key || "");
          setIsTesterModalOpen(true);
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Control Bar: Project & Environment Switcher */}
        <ProjectEnvSwitcher
          projects={projects}
          selectedProject={selectedProject}
          selectedEnvironment={selectedEnvironment}
          onSelectProject={(proj) => {
            setSelectedProject(proj);
            if (proj.environments?.[0]) {
              const prod =
                proj.environments.find((e) => e.name.toLowerCase().includes("prod")) ||
                proj.environments[0];
              setSelectedEnvironment(prod);
            }
          }}
          onSelectEnvironment={(env) => setSelectedEnvironment(env)}
          onRefresh={handleRefresh}
        />

        {/* Feature Flag List Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Feature Flags</span>
                <span className="text-xs font-normal text-slate-400 font-mono">
                  ({flags.length} defined)
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Manage live targeting rules, percentage rollouts, and kill switches for{" "}
                <span className="text-blue-400 font-medium">{selectedEnvironment?.name}</span>.
              </p>
            </div>

            <button
              onClick={handleRefresh}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-colors border border-slate-800"
              title="Refresh flags"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="p-16 text-center space-y-3 bg-slate-900/40 rounded-2xl border border-slate-800">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Loading flags from Prisma database...</p>
            </div>
          ) : (
            <FlagList
              flags={flags}
              environment={selectedEnvironment}
              onEditFlag={(flag) => setEditingFlag(flag)}
              onTestFlag={(flagKey) => {
                setTesterFlagKey(flagKey);
                setIsTesterModalOpen(true);
              }}
              onRefresh={fetchFlags}
            />
          )}
        </div>

        {/* Quick Launchpad & SDK Instructions Box */}
        <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950 p-5 space-y-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">
              FlagOps High-Performance Evaluation Architecture
            </h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-4xl">
            Flags are evaluated with zero external dependencies using deterministic hashing (<code className="text-blue-400">MurmurHash3 32-bit</code>) and JSON user segment attribute matching (EQUALS, IN_ARRAY, REGEX, GREATER_THAN, CONTAINS). Real-time invalidations are streamed via Server-Sent Events (<code className="text-cyan-400">SSE</code>) to in-memory client SDKs resolving in <strong className="text-white">&lt;0.01ms</strong> without network hops.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <span className="text-slate-500 font-mono">Evaluation API:</span>
            <code className="px-2 py-1 rounded bg-slate-950 text-blue-400 font-mono text-[11px] border border-slate-800">
              POST /api/v1/evaluate
            </code>
            <span className="text-slate-500 font-mono">SSE Stream:</span>
            <code className="px-2 py-1 rounded bg-slate-950 text-cyan-400 font-mono text-[11px] border border-slate-800">
              GET /api/v1/stream?envKey=...
            </code>
            <span className="text-slate-500 font-mono">Active Key:</span>
            <code className="px-2 py-1 rounded bg-slate-950 text-amber-400 font-mono text-[11px] border border-slate-800 truncate max-w-xs">
              {selectedEnvironment?.apiKey || "Select Environment"}
            </code>
          </div>
        </div>
      </main>

      {/* Flag Editor Modal (Targeting, Rollout Slider, Kill Switch) */}
      <FlagEditorModal
        isOpen={Boolean(editingFlag)}
        onClose={() => setEditingFlag(null)}
        flag={editingFlag}
        environment={selectedEnvironment}
        onRuleUpdated={fetchFlags}
      />

      {/* Create Flag Modal */}
      {selectedProject && (
        <CreateFlagModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          projectId={selectedProject.id}
          onCreated={fetchFlags}
        />
      )}

      {/* Live SDK Tester Modal */}
      <SdkTesterModal
        isOpen={isTesterModalOpen}
        onClose={() => setIsTesterModalOpen(false)}
        environment={selectedEnvironment}
        flags={flags}
        initialFlagKey={testerFlagKey}
      />
    </div>
  );
}
