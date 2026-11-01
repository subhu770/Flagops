"use client";

import React, { useState } from "react";
import { FeatureFlagWithRules, UserSegmentRule } from "@/lib/types";
import { Environment, FlagType } from "@prisma/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  Sliders,
  Flame,
  Terminal,
  Trash2,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  FileCode,
  Type,
  GitFork,
  Users,
  Percent,
} from "lucide-react";

interface FlagListProps {
  flags: FeatureFlagWithRules[];
  environment: Environment | null;
  onEditFlag: (flag: FeatureFlagWithRules) => void;
  onTestFlag: (flagKey: string) => void;
  onRefresh: () => void;
}

export const FlagList: React.FC<FlagListProps> = ({
  flags,
  environment,
  onEditFlag,
  onTestFlag,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [togglingFlagId, setTogglingFlagId] = useState<string | null>(null);

  if (!environment) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800">
        Please select or create an environment to view feature flags.
      </div>
    );
  }

  // Instant optimistic toggle for a flag in current environment
  const handleToggle = async (flag: FeatureFlagWithRules, currentEnabled: boolean) => {
    setTogglingFlagId(flag.id);
    const newEnabled = !currentEnabled;
    const rule = flag.targetingRules.find((r) => r.environmentId === environment.id);

    try {
      const res = await fetch(`/api/flags/${flag.id}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environmentId: environment.id,
          enabled: newEnabled,
          rolloutPercentage: rule ? rule.rolloutPercentage : (newEnabled ? 100 : 0),
          userSegments: rule?.userSegments || [],
          modifiedBy: "dashboard.user@flagops.io",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to toggle flag");
      }

      onRefresh();
    } catch (err) {
      console.error(err);
      alert("Failed to update flag state");
    } finally {
      setTogglingFlagId(null);
    }
  };

  // Instant kill switch
  const handleQuickKill = async (flag: FeatureFlagWithRules) => {
    if (!confirm(`Engage Emergency Kill Switch for "${flag.key}" in ${environment.name}? Traffic will be completely cut immediately.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/flags/${flag.id}/kill-switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environmentId: environment.id,
          reason: `Quick kill switch executed from flag list in ${environment.name}`,
          modifiedBy: "dashboard.user@flagops.io",
        }),
      });

      if (!res.ok) throw new Error("Kill switch failed");
      onRefresh();
    } catch (err) {
      console.error(err);
      alert("Kill switch error");
    }
  };

  // Delete flag
  const handleDeleteFlag = async (flag: FeatureFlagWithRules) => {
    if (!confirm(`Are you sure you want to delete flag "${flag.key}"? This will delete all targeting rules and audit records across all environments.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/flags/${flag.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Delete failed");
      onRefresh();
    } catch (err) {
      console.error(err);
      alert("Failed to delete flag");
    }
  };

  // Filter flags
  const filteredFlags = flags.filter((flag) => {
    const matchesSearch =
      flag.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (flag.description && flag.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = filterType === "ALL" || flag.flagType === filterType;

    const rule = flag.targetingRules.find((r) => r.environmentId === environment.id);
    const isEnabled = rule?.enabled ?? false;
    const matchesStatus =
      filterStatus === "ALL" ||
      (filterStatus === "ENABLED" && isEnabled) ||
      (filterStatus === "DISABLED" && !isEnabled);

    return matchesSearch && matchesType && matchesStatus;
  });

  const getFlagTypeIcon = (type: FlagType) => {
    switch (type) {
      case FlagType.BOOLEAN:
        return <ToggleLeft className="w-3.5 h-3.5 text-blue-400" />;
      case FlagType.STRING:
        return <Type className="w-3.5 h-3.5 text-emerald-400" />;
      case FlagType.JSON:
        return <FileCode className="w-3.5 h-3.5 text-purple-400" />;
      case FlagType.MULTIVARIATE:
        return <GitFork className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-3 rounded-2xl">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search flags by key, slug, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2">
          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ALL">All Types</option>
            <option value="BOOLEAN">Boolean</option>
            <option value="STRING">String</option>
            <option value="JSON">JSON</option>
            <option value="MULTIVARIATE">Multivariate</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ALL">All States</option>
            <option value="ENABLED">Active Only</option>
            <option value="DISABLED">Disabled Only</option>
          </select>
        </div>
      </div>

      {/* Flag List Cards */}
      {filteredFlags.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/60 rounded-2xl border border-slate-800/80 space-y-3">
          <p className="text-sm font-medium text-slate-300">No feature flags match your filter.</p>
          <p className="text-xs text-slate-500">
            Try adjusting your search criteria or create a new flag above.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFlags.map((flag) => {
            const rule = flag.targetingRules.find(
              (r) => r.environmentId === environment.id
            );
            const isEnabled = rule?.enabled ?? false;
            const rolloutPct = rule?.rolloutPercentage ?? 0;
            const segments = (rule?.userSegments as unknown as UserSegmentRule[]) || [];

            return (
              <div
                key={flag.id}
                className="group relative bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 sm:p-5 transition-all shadow-md hover:shadow-xl"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Flag Key, Info, Type, Segments */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Flag Key */}
                      <span className="font-mono text-sm sm:text-base font-bold text-white tracking-tight">
                        {flag.key}
                      </span>

                      {/* Type Badge */}
                      <Badge variant="outline" size="sm" className="gap-1.5">
                        {getFlagTypeIcon(flag.flagType)}
                        <span>{flag.flagType}</span>
                      </Badge>

                      {/* Active State Pill */}
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isEnabled
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isEnabled ? "bg-emerald-400 animate-pulse-subtle" : "bg-slate-500"
                          }`}
                        />
                        {isEnabled ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>

                    {/* Description */}
                    {flag.description && (
                      <p className="text-xs text-slate-400 line-clamp-1">
                        {flag.description}
                      </p>
                    )}

                    {/* Targeting Indicators & Segment Badges */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      {/* Rollout percentage pill */}
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300">
                        <Percent className="w-3 h-3 text-blue-400" />
                        <span>{rolloutPct}% Rollout</span>
                        <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden ml-1">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${rolloutPct}%` }}
                          />
                        </div>
                      </div>

                      {/* User Segments Indicator */}
                      {segments.length > 0 ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-950/60 border border-purple-500/30 text-[11px] text-purple-300">
                          <Users className="w-3 h-3" />
                          <span>{segments.length} segment condition{segments.length > 1 ? "s" : ""}:</span>
                          <span className="font-mono text-purple-200">
                            {segments.map((s) => s.attribute).join(", ")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          All users in rollout
                        </span>
                      )}

                      <span className="text-[11px] text-slate-500 font-mono">
                        Updated {formatDate(rule?.updatedAt || flag.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Right: Instant Toggle & Action Buttons */}
                  <div className="flex items-center justify-between lg:justify-end gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800/80">
                    {/* Instant Status Switch Toggle */}
                    <div className="flex items-center gap-2 pr-2 border-r border-slate-800">
                      <Switch
                        checked={isEnabled}
                        disabled={togglingFlagId === flag.id}
                        onCheckedChange={() => handleToggle(flag, isEnabled)}
                        size="md"
                        id={`toggle-${flag.id}`}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      {/* Edit Rules Button */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onEditFlag(flag)}
                        title="Configure targeting rules and rollout"
                      >
                        <Sliders className="w-3.5 h-3.5 mr-1 text-blue-400" />
                        Targeting
                      </Button>

                      {/* SDK Simulator */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onTestFlag(flag.key)}
                        title="Test SDK evaluation with user attributes"
                      >
                        <Terminal className="w-3.5 h-3.5 mr-1 text-slate-400" />
                        Test SDK
                      </Button>

                      {/* Emergency Kill */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleQuickKill(flag)}
                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 p-2"
                        title="Engage emergency kill switch"
                      >
                        <Flame className="w-4 h-4" />
                      </Button>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteFlag(flag)}
                        className="text-slate-500 hover:text-rose-400 hover:bg-slate-800/60 p-2"
                        title="Delete feature flag"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
