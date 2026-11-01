"use client";

import React, { useState, useEffect } from "react";
import { FeatureFlagWithRules, UserSegmentRule } from "@/lib/types";
import { Environment, FlagType } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  AlertTriangle,
  Plus,
  Trash2,
  Sliders,
  History,
  Info,
  CheckCircle2,
  Flame,
  Code,
  Sparkles,
} from "lucide-react";

interface FlagEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  flag: FeatureFlagWithRules | null;
  environment: Environment | null;
  onRuleUpdated: () => void;
}

export const FlagEditorModal: React.FC<FlagEditorModalProps> = ({
  isOpen,
  onClose,
  flag,
  environment,
  onRuleUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<"targeting" | "details" | "history">("targeting");
  const [enabled, setEnabled] = useState(false);
  const [rolloutPercentage, setRolloutPercentage] = useState(100);
  const [segments, setSegments] = useState<UserSegmentRule[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isKilling, setIsKilling] = useState(false);
  const [killSwitchConfirm, setKillSwitchConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Metadata edit
  const [description, setDescription] = useState("");
  const [defaultValueStr, setDefaultValueStr] = useState("");

  // Populate state when flag or environment changes
  useEffect(() => {
    if (!flag || !environment) return;

    const rule = flag.targetingRules.find((r) => r.environmentId === environment.id);

    if (rule) {
      setEnabled(rule.enabled);
      setRolloutPercentage(rule.rolloutPercentage);
      setSegments((rule.userSegments as unknown as UserSegmentRule[]) || []);
    } else {
      setEnabled(false);
      setRolloutPercentage(0);
      setSegments([]);
    }

    setDescription(flag.description || "");
    setDefaultValueStr(
      typeof flag.defaultValue === "object"
        ? JSON.stringify(flag.defaultValue, null, 2)
        : String(flag.defaultValue ?? "")
    );
    setKillSwitchConfirm(false);
    setSaveSuccess(false);
  }, [flag, environment, isOpen]);

  if (!flag || !environment) return null;

  const currentRule = flag.targetingRules.find((r) => r.environmentId === environment.id);

  // Rule builder actions
  const handleAddSegment = () => {
    const newSegment: UserSegmentRule = {
      id: "seg_" + Math.random().toString(36).substring(2, 9),
      attribute: "country",
      operator: "is_one_of",
      value: "US, CA",
    };
    setSegments([...segments, newSegment]);
  };

  const handleUpdateSegment = (
    id: string,
    field: keyof UserSegmentRule,
    value: string
  ) => {
    setSegments(
      segments.map((seg) => (seg.id === id ? { ...seg, [field]: value } : seg))
    );
  };

  const handleRemoveSegment = (id: string) => {
    setSegments(segments.filter((seg) => seg.id !== id));
  };

  // Save targeting rule
  const handleSaveRule = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/flags/${flag.id}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environmentId: environment.id,
          enabled,
          rolloutPercentage,
          userSegments: segments,
          modifiedBy: "lead.engineer@flagops.io",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to update targeting rules");
        return;
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      onRuleUpdated();
    } catch (err) {
      console.error(err);
      alert("Error saving rule");
    } finally {
      setIsSaving(false);
    }
  };

  // Emergency Kill Switch
  const handleKillSwitch = async () => {
    setIsKilling(true);
    try {
      const res = await fetch(`/api/flags/${flag.id}/kill-switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environmentId: environment.id,
          reason: `Kill switch engaged from dashboard by on-call engineer for ${environment.name}`,
          modifiedBy: "emergency.killswitch@flagops.io",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to engage kill switch");
        return;
      }

      setEnabled(false);
      setRolloutPercentage(0);
      setKillSwitchConfirm(false);
      onRuleUpdated();
    } catch (err) {
      console.error(err);
      alert("Error triggering kill switch");
    } finally {
      setIsKilling(false);
    }
  };

  // Save metadata
  const handleSaveMetadata = async () => {
    setIsSaving(true);
    try {
      let parsedDefaultValue: any = defaultValueStr;
      if (flag.flagType === FlagType.BOOLEAN) {
        parsedDefaultValue = defaultValueStr === "true";
      } else if (flag.flagType === FlagType.JSON || flag.flagType === FlagType.MULTIVARIATE) {
        try {
          parsedDefaultValue = JSON.parse(defaultValueStr);
        } catch {
          alert("Invalid JSON format in Default Value");
          setIsSaving(false);
          return;
        }
      }

      const res = await fetch(`/api/flags/${flag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          defaultValue: parsedDefaultValue,
          modifiedBy: "lead.engineer@flagops.io",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to update flag details");
        return;
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      onRuleUpdated();
    } catch (err) {
      console.error(err);
      alert("Error updating metadata");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-base font-bold text-white bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            {flag.key}
          </span>
          <Badge variant="outline" size="sm">
            {flag.flagType}
          </Badge>
          <span className="text-slate-500 text-xs">in</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {environment.name}
          </span>
        </div>
      }
      description={flag.description || "Manage environment targeting rules, rollout percentages, and kill switch."}
    >
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("targeting")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === "targeting"
              ? "bg-blue-600 text-white font-semibold shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Targeting & Rollout
        </button>

        <button
          onClick={() => setActiveTab("details")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === "details"
              ? "bg-blue-600 text-white font-semibold shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          Flag Metadata & Value
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === "history"
              ? "bg-blue-600 text-white font-semibold shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Audit History ({flag.auditLogs?.length || 0})
        </button>
      </div>

      {/* TAB 1: TARGETING & ROLLOUT */}
      {activeTab === "targeting" && (
        <div className="space-y-6">
          {/* Top Row: Master Toggle & Kill Switch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800/90">
            <div className="flex items-center gap-4">
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                size="lg"
                id="master-toggle"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    Master State: {enabled ? "Active" : "Disabled"}
                  </span>
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      enabled
                        ? "bg-emerald-400 shadow-emerald-400/50 shadow-sm animate-pulse-subtle"
                        : "bg-slate-600"
                    }`}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  {enabled
                    ? `Traffic is evaluated according to rules below for ${environment.name}`
                    : `Flag returns default value regardless of user segments`}
                </p>
              </div>
            </div>

            {/* Emergency Kill Switch */}
            <div>
              {!killSwitchConfirm ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setKillSwitchConfirm(true)}
                  className="w-full sm:w-auto"
                >
                  <Flame className="w-4 h-4 mr-1.5 text-rose-200 animate-pulse" />
                  Kill Switch
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-400 font-medium">Confirm Kill?</span>
                  <Button
                    variant="danger"
                    size="sm"
                    isLoading={isKilling}
                    onClick={handleKillSwitch}
                  >
                    Yes, Kill Traffic
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setKillSwitchConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Section: Percentage Rollout */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>Percentage Rollout</span>
                  <Badge variant={rolloutPercentage > 0 ? "info" : "outline"} size="sm">
                    {rolloutPercentage}% of target traffic
                  </Badge>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Consistent hashed distribution across users matching segment rules.
                </p>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5">
                {[0, 10, 25, 50, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRolloutPercentage(preset)}
                    className={`px-2 py-1 text-xs font-mono rounded-md transition-colors ${
                      rolloutPercentage === preset
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>

            {/* Slider */}
            <div className="pt-2">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={rolloutPercentage}
                onChange={(e) => setRolloutPercentage(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              {/* Traffic visualizer bar */}
              <div className="w-full h-2 rounded-full bg-slate-800 mt-2 overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${rolloutPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Section: Dynamic Rule Builder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white">Targeting Rules & User Segments</h4>
                <p className="text-xs text-slate-400">
                  Target users by matching request context attributes (e.g., country, email domain, tier).
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleAddSegment}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Condition
              </Button>
            </div>

            {segments.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center bg-slate-950/30">
                <p className="text-xs text-slate-400">
                  No attribute conditions configured. 100% of evaluated users will enter the rollout bucket.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddSegment}
                  className="mt-2 text-blue-400 hover:text-blue-300"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add First Targeting Condition
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {segments.map((segment, index) => (
                  <div
                    key={segment.id}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800"
                  >
                    <span className="text-xs font-mono font-bold text-slate-500 px-1 select-none">
                      #{index + 1}
                    </span>

                    {/* Attribute Selector */}
                    <div className="w-full sm:w-44">
                      <input
                        type="text"
                        placeholder="Attribute (e.g. country, email, tier)"
                        value={segment.attribute}
                        onChange={(e) =>
                          handleUpdateSegment(segment.id, "attribute", e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>

                    {/* Operator */}
                    <div className="w-full sm:w-36">
                      <select
                        value={segment.operator}
                        onChange={(e) =>
                          handleUpdateSegment(segment.id, "operator", e.target.value)
                        }
                        className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="is_one_of">is one of</option>
                        <option value="equals">equals</option>
                        <option value="not_equals">does not equal</option>
                        <option value="contains">contains</option>
                        <option value="matches_regex">matches regex</option>
                        <option value="greater_than">greater than</option>
                        <option value="less_than">less than</option>
                      </select>
                    </div>

                    {/* Value */}
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Value (e.g. US, CA, or @company.com)"
                        value={segment.value}
                        onChange={(e) =>
                          handleUpdateSegment(segment.id, "value", e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleRemoveSegment(segment.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors self-end sm:self-auto"
                      title="Remove condition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <div>
              {saveSuccess && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Targeting rules applied successfully!
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button isLoading={isSaving} onClick={handleSaveRule}>
                Save & Apply Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FLAG METADATA & VALUE */}
      {activeTab === "details" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain the purpose of this flag and its rollout plan..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Default Value ({flag.flagType})
            </label>
            {flag.flagType === FlagType.BOOLEAN ? (
              <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <Switch
                  checked={defaultValueStr === "true"}
                  onCheckedChange={(val) => setDefaultValueStr(String(val))}
                  size="md"
                  label={`Default is ${defaultValueStr === "true" ? "TRUE" : "FALSE"}`}
                />
              </div>
            ) : (
              <textarea
                rows={5}
                value={defaultValueStr}
                onChange={(e) => setDefaultValueStr(e.target.value)}
                placeholder="Default value fallback"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            <p className="text-[11px] text-slate-500 mt-1">
              Returned when the flag is disabled, in kill switch state, or when client cannot connect.
            </p>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-800">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button isLoading={isSaving} onClick={handleSaveMetadata}>
              Update Metadata
            </Button>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT HISTORY */}
      {activeTab === "history" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Cryptographic change log tracking every targeting rule update, toggle switch, and kill switch execution.
          </p>

          <div className="space-y-2.5 max-h-96 overflow-y-auto">
            {(!flag.auditLogs || flag.auditLogs.length === 0) ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No audit entries recorded yet for this flag.
              </div>
            ) : (
              flag.auditLogs.map((log) => {
                const diffObj =
                  typeof log.diff === "object"
                    ? log.diff
                    : JSON.parse(String(log.diff || "{}"));
                return (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {diffObj.action || "CONFIG_CHANGED"}
                        </span>
                        {diffObj.environment && (
                          <Badge variant="outline" size="sm">
                            {diffObj.environment}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400">
                      Modified by: <span className="text-slate-300 font-mono">{log.modifiedBy}</span>
                    </div>

                    {diffObj.changes && (
                      <pre className="text-[11px] font-mono bg-slate-900/90 p-2 rounded-lg text-slate-300 overflow-x-auto border border-slate-800/80">
                        {JSON.stringify(diffObj.changes, null, 2)}
                      </pre>
                    )}

                    {diffObj.reason && (
                      <p className="text-xs text-rose-400 italic">
                        Reason: {diffObj.reason}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
};
