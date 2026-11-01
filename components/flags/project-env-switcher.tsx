"use client";

import React, { useState } from "react";
import { Project, Environment } from "@prisma/client";
import { ChevronDown, Plus, Key, Copy, Check, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface ProjectWithEnvs extends Project {
  environments: Environment[];
  _count?: { flags: number };
}

interface ProjectEnvSwitcherProps {
  projects: ProjectWithEnvs[];
  selectedProject: ProjectWithEnvs | null;
  selectedEnvironment: Environment | null;
  onSelectProject: (project: ProjectWithEnvs) => void;
  onSelectEnvironment: (environment: Environment) => void;
  onRefresh: () => void;
}

export const ProjectEnvSwitcher: React.FC<ProjectEnvSwitcherProps> = ({
  projects,
  selectedProject,
  selectedEnvironment,
  onSelectProject,
  onSelectEnvironment,
  onRefresh,
}) => {
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [newEnvModalOpen, setNewEnvModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // New Project Form
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // New Env Form
  const [envName, setEnvName] = useState("");
  const [isCreatingEnv, setIsCreatingEnv] = useState(false);

  const handleCopyApiKey = () => {
    if (!selectedEnvironment) return;
    navigator.clipboard.writeText(selectedEnvironment.apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setIsCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          slug: projectSlug || projectName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create project");
        return;
      }

      const newProj = await res.json();
      setNewProjectModalOpen(false);
      setProjectName("");
      setProjectSlug("");
      onRefresh();
      onSelectProject(newProj);
      if (newProj.environments?.[0]) {
        onSelectEnvironment(newProj.environments[0]);
      }
    } catch (err) {
      console.error(err);
      alert("Error creating project");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleCreateEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!envName.trim() || !selectedProject) return;

    setIsCreatingEnv(true);
    try {
      const res = await fetch("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject.id,
          name: envName,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create environment");
        return;
      }

      const newEnv = await res.json();
      setNewEnvModalOpen(false);
      setEnvName("");
      onRefresh();
      onSelectEnvironment(newEnv);
    } catch (err) {
      console.error(err);
      alert("Error creating environment");
    } finally {
      setIsCreatingEnv(false);
    }
  };

  const getEnvBadgeColor = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("prod")) {
      return "text-emerald-400 bg-emerald-950/60 border-emerald-500/30";
    }
    if (lower.includes("stage") || lower.includes("test")) {
      return "text-amber-400 bg-amber-950/60 border-amber-500/30";
    }
    return "text-sky-400 bg-sky-950/60 border-sky-500/30";
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-xl">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Project Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-white font-medium text-sm transition-all focus:ring-2 focus:ring-blue-500"
            >
              <div className="w-5 h-5 rounded-md bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <span className="max-w-[180px] truncate">
                {selectedProject ? selectedProject.name : "Select Project"}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {projectDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setProjectDropdownOpen(false)}
                />
                <div className="absolute left-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-30">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Your Projects
                  </div>
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => {
                        onSelectProject(proj);
                        if (proj.environments?.[0]) {
                          onSelectEnvironment(proj.environments[0]);
                        }
                        setProjectDropdownOpen(false);
                      }}
                      className={`w-full px-3.5 py-2 text-left text-sm flex items-center justify-between hover:bg-slate-800/70 transition-colors ${
                        selectedProject?.id === proj.id
                          ? "text-blue-400 font-semibold bg-blue-500/10"
                          : "text-slate-300"
                      }`}
                    >
                      <span className="truncate">{proj.name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {proj.slug}
                      </span>
                    </button>
                  ))}
                  <div className="border-t border-slate-800 my-1 pt-1">
                    <button
                      onClick={() => {
                        setProjectDropdownOpen(false);
                        setNewProjectModalOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-blue-400 hover:text-blue-300 hover:bg-slate-800/60 flex items-center gap-2 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create New Project
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Environment Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/70 rounded-xl border border-slate-800/90">
            {selectedProject?.environments?.map((env) => {
              const isActive = selectedEnvironment?.id === env.id;
              return (
                <button
                  key={env.id}
                  onClick={() => onSelectEnvironment(env)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? "bg-slate-800 text-white shadow-sm border border-slate-700 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      env.name.toLowerCase().includes("prod")
                        ? "bg-emerald-400 shadow-emerald-400/50 shadow-sm"
                        : env.name.toLowerCase().includes("stage")
                        ? "bg-amber-400 shadow-amber-400/50 shadow-sm"
                        : "bg-sky-400 shadow-sky-400/50 shadow-sm"
                    }`}
                  />
                  {env.name}
                </button>
              );
            })}

            <button
              onClick={() => setNewEnvModalOpen(true)}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors"
              title="Add Environment"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Environment API Key Viewer */}
        {selectedEnvironment && (
          <div className="flex items-center gap-2.5 bg-slate-950/60 border border-slate-800/80 px-3.5 py-1.5 rounded-xl">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-medium text-slate-300">SDK Key:</span>
              <span className="font-mono text-slate-400 text-[11px] max-w-[150px] sm:max-w-[200px] truncate">
                {selectedEnvironment.apiKey}
              </span>
            </div>
            <button
              onClick={handleCopyApiKey}
              className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
              title="Copy SDK Environment Key"
            >
              {copiedKey ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Modal: Create New Project */}
      <Dialog
        isOpen={newProjectModalOpen}
        onClose={() => setNewProjectModalOpen(false)}
        title="Create New Project"
        description="A project groups environments, flags, and targeting rules for a product or service."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Billing Service, Web App"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value);
                if (!projectSlug) {
                  setProjectSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-")
                  );
                }
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Project Slug
            </label>
            <input
              type="text"
              required
              placeholder="e.g. billing-service"
              value={projectSlug}
              onChange={(e) => setProjectSlug(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Used in API endpoints and URLs. Standard environments (Production, Staging, Development) are created automatically.
            </p>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewProjectModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isCreatingProject}>
              Create Project
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Modal: Create New Environment */}
      <Dialog
        isOpen={newEnvModalOpen}
        onClose={() => setNewEnvModalOpen(false)}
        title={`Add Environment to ${selectedProject?.name}`}
        description="Create an isolated environment (e.g. QA, Demo, Sandbox) with a unique secure SDK API key."
      >
        <form onSubmit={handleCreateEnv} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Environment Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. QA Testing, Demo, Canary"
              value={envName}
              onChange={(e) => setEnvName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewEnvModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isCreatingEnv}>
              Add Environment
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
