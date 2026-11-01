"use client";

import React, { useState } from "react";
import { FlagType } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleLeft, FileCode, Type, GitFork } from "lucide-react";

interface CreateFlagModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onCreated: () => void;
}

export const CreateFlagModal: React.FC<CreateFlagModalProps> = ({
  isOpen,
  onClose,
  projectId,
  onCreated,
}) => {
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [flagType, setFlagType] = useState<FlagType>(FlagType.BOOLEAN);
  const [defaultValueBool, setDefaultValueBool] = useState(false);
  const [defaultValueText, setDefaultValueText] = useState("");
  const [initialEnabled, setInitialEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const flagTypeOptions = [
    {
      type: FlagType.BOOLEAN,
      label: "Boolean",
      desc: "Standard on/off feature flag",
      icon: ToggleLeft,
    },
    {
      type: FlagType.STRING,
      label: "String",
      desc: "Text value, banner message, or URL",
      icon: Type,
    },
    {
      type: FlagType.JSON,
      label: "JSON",
      desc: "Structured remote configuration object",
      icon: FileCode,
    },
    {
      type: FlagType.MULTIVARIATE,
      label: "Multivariate",
      desc: "Multi-variant A/B/n test payload",
      icon: GitFork,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !projectId) return;

    let parsedDefault: any = defaultValueBool;
    if (flagType === FlagType.STRING) {
      parsedDefault = defaultValueText.trim();
    } else if (flagType === FlagType.JSON || flagType === FlagType.MULTIVARIATE) {
      try {
        parsedDefault = defaultValueText.trim()
          ? JSON.parse(defaultValueText)
          : {};
      } catch {
        alert("Invalid JSON default value format");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          key: key.trim(),
          description: description.trim(),
          flagType,
          defaultValue: parsedDefault,
          initialEnabled,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create feature flag");
        return;
      }

      onClose();
      setKey("");
      setDescription("");
      setDefaultValueText("");
      setDefaultValueBool(false);
      onCreated();
    } catch (err) {
      console.error(err);
      alert("Error creating flag");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Create Feature Flag"
      description="Feature flags allow you to decouple deployment from release, roll out safely, and target user cohorts."
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Key input */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Flag Key <span className="text-blue-400">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="e.g. new-checkout-flow, ai-search-ranking"
            value={key}
            onChange={(e) =>
              setKey(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_-]/g, "-")
                  .replace(/-+/g, "-")
              )
            }
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-600"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Unique slug referenced in your codebase via SDK calls (e.g. <code className="text-slate-400">client.variation(&quot;{key || "flag-key"}&quot;)</code>).
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Description
          </label>
          <textarea
            rows={2}
            placeholder="What does this feature flag control and who owns it?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-600"
          />
        </div>

        {/* Flag Type Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Flag Type
          </label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {flagTypeOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = flagType === opt.type;
              return (
                <button
                  type="button"
                  key={opt.type}
                  onClick={() => setFlagType(opt.type)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-blue-600/15 border-blue-500 text-white shadow-sm shadow-blue-500/20"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <Icon className={`w-4 h-4 mb-1.5 ${isSelected ? "text-blue-400" : "text-slate-500"}`} />
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Default Value */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Default Fallback Value
          </label>
          {flagType === FlagType.BOOLEAN ? (
            <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
              <Switch
                checked={defaultValueBool}
                onCheckedChange={setDefaultValueBool}
                size="md"
                label={defaultValueBool ? "Default TRUE (Enabled)" : "Default FALSE (Disabled)"}
              />
            </div>
          ) : flagType === FlagType.STRING ? (
            <input
              type="text"
              placeholder="e.g. 25MB, standard, v2-beta"
              value={defaultValueText}
              onChange={(e) => setDefaultValueText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          ) : (
            <textarea
              rows={4}
              placeholder={`{\n  "version": "1.0",\n  "maxRetries": 3\n}`}
              value={defaultValueText}
              onChange={(e) => setDefaultValueText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        {/* Initial Rollout state */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-white">Enable Initially in Production</span>
            <p className="text-[11px] text-slate-400">
              If enabled, defaults to 100% rollout in non-development environments.
            </p>
          </div>
          <Switch checked={initialEnabled} onCheckedChange={setInitialEnabled} size="sm" />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create Feature Flag
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
