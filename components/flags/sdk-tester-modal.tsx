"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Environment, FeatureFlag } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeatureFlagWithRules } from "@/lib/types";
import {
  evaluateFlag,
  murmurHash3,
  matchesSegmentRule,
  UserContext,
  UserSegmentRule,
} from "@/lib/evaluation/engine";
import {
  Play,
  CheckCircle2,
  XCircle,
  Terminal,
  Copy,
  Check,
  Zap,
  Hash,
  Clock,
  Layers,
  Cpu,
  CheckCheck,
  AlertCircle,
} from "lucide-react";

interface SdkTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  environment: Environment | null;
  flags: (FeatureFlagWithRules | FeatureFlag)[];
  initialFlagKey?: string;
}

interface SegmentEvalItem {
  attribute: string;
  operator: string;
  expected: unknown;
  actual: unknown;
  matched: boolean;
}

interface EvaluationResultDetails {
  flagKey: string;
  enabled: boolean;
  value: unknown;
  reason: string;
  matchedRuleId?: string;
  bucket: number;
  rolloutPercentage: number;
  hashUint32: number;
  hashHex: string;
  inputKey: string;
  durationUs: number;
  durationNs?: number;
  source: "api" | "client_engine";
  telemetryStats?: {
    hits?: string;
    cacheHitRatio?: string;
    durationUs?: string;
  } | null;
  segmentEvaluations: SegmentEvalItem[];
  allSegmentsMatched: boolean;
}

export const SdkTesterModal: React.FC<SdkTesterModalProps> = ({
  isOpen,
  onClose,
  environment,
  flags,
  initialFlagKey,
}) => {
  // Flag selection state
  const [selectedFlagKey, setSelectedFlagKey] = useState<string>(
    initialFlagKey || flags[0]?.key || ""
  );

  // Form inputs for user context
  const [userKey, setUserKey] = useState<string>("user_alice_8492");
  const [userEmail, setUserEmail] = useState<string>("alice@example.com");
  const [userCountry, setUserCountry] = useState<string>("US");
  const [userBetaGroup, setUserBetaGroup] = useState<string>("early_adopters");
  const [userTier, setUserTier] = useState<string>("enterprise");

  // Evaluation execution state
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evalResult, setEvalResult] = useState<EvaluationResultDetails | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  // Code snippet tabs
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [snippetTab, setSnippetTab] = useState<"sdk" | "react" | "curl" | "node">("sdk");

  // Keep selected flag in sync with initialFlagKey, flags changes, or modal opening
  useEffect(() => {
    if (isOpen) {
      if (initialFlagKey && flags.some((f) => f.key === initialFlagKey)) {
        setSelectedFlagKey(initialFlagKey);
      } else if (!selectedFlagKey && flags.length > 0) {
        setSelectedFlagKey(flags[0].key);
      } else if (
        selectedFlagKey &&
        flags.length > 0 &&
        !flags.some((f) => f.key === selectedFlagKey)
      ) {
        setSelectedFlagKey(flags[0].key);
      }
    }
  }, [isOpen, initialFlagKey, flags, selectedFlagKey]);

  // Fallback active flag key
  const activeFlagKey = selectedFlagKey || initialFlagKey || flags[0]?.key || "";

  // Currently selected flag object
  const currentFlag = useMemo(() => {
    return flags.find((f) => f.key === activeFlagKey);
  }, [flags, activeFlagKey]);

  // Current flag's targeting rule for this environment
  const currentRule = useMemo(() => {
    if (!currentFlag) return undefined;
    const rules = (currentFlag as FeatureFlagWithRules).targetingRules;
    if (Array.isArray(rules) && environment?.id) {
      return rules.find((r) => r.environmentId === environment.id) || rules[0];
    }
    return undefined;
  }, [currentFlag, environment?.id]);

  // Evaluation trigger handler
  const handleEvaluate = useCallback(async () => {
    setEvalError(null);

    const flagKeyToEval = activeFlagKey;
    if (!flagKeyToEval) {
      setEvalError("No feature flag selected. Please pick a flag to simulate.");
      return;
    }

    setIsEvaluating(true);

    const startPerf = performance.now();

    try {
      // 1. Prepare user context
      const trimmedUserId = userKey.trim() || "anonymous";
      const userAttributes: Record<string, unknown> = {
        email: userEmail.trim(),
        country: userCountry.trim(),
        betaGroup: userBetaGroup.trim(),
        tier: userTier.trim(),
      };

      const userContext: UserContext = {
        userId: trimmedUserId,
        attributes: userAttributes,
      };

      // 2. Client-side MurmurHash3 calculation
      const combined = `${flagKeyToEval}:${trimmedUserId}`;
      const hash32 = murmurHash3(combined);
      const hashHex = "0x" + hash32.toString(16).padStart(8, "0").toUpperCase();
      const bucket = (hash32 >>> 0) % 100;

      // 3. User Segment Conditions evaluation
      let parsedSegments: UserSegmentRule[] = [];
      if (currentRule?.userSegments) {
        if (typeof currentRule.userSegments === "string" && currentRule.userSegments.trim()) {
          try {
            parsedSegments = JSON.parse(currentRule.userSegments);
          } catch {
            parsedSegments = [];
          }
        } else if (Array.isArray(currentRule.userSegments)) {
          parsedSegments = currentRule.userSegments as unknown as UserSegmentRule[];
        }
      }

      const segmentEvaluations: SegmentEvalItem[] = parsedSegments.map((seg) => {
        const attrVal = userAttributes[seg.attribute];
        const matched = matchesSegmentRule(seg, userContext);
        return {
          attribute: seg.attribute,
          operator: String(seg.operator),
          expected: seg.value,
          actual: attrVal !== undefined ? attrVal : "(not provided)",
          matched,
        };
      });

      const allSegmentsMatched =
        segmentEvaluations.length === 0 || segmentEvaluations.every((s) => s.matched);

      // 4. In-Memory Client Engine Evaluation
      const clientEval = evaluateFlag(
        {
          key: flagKeyToEval,
          defaultValue: currentFlag?.defaultValue ?? false,
          flagType: currentFlag?.flagType ?? "BOOLEAN",
        },
        currentRule
          ? {
              id: currentRule.id,
              enabled: currentRule.enabled,
              rolloutPercentage: currentRule.rolloutPercentage,
              userSegments: parsedSegments,
            }
          : undefined,
        userContext
      );

      const clientEndPerf = performance.now();
      const localDurationUs = Math.max(1, Math.round((clientEndPerf - startPerf) * 1000));
      const localDurationNs = Math.max(100, Math.round((clientEndPerf - startPerf) * 1_000_000));

      // 5. Trigger network call to /api/v1/evaluate
      let serverResponseData: {
        enabled?: boolean;
        value?: unknown;
        matchedRuleId?: string;
        bucket?: number;
        reason?: string;
        rolloutPercentage?: number;
      } | null = null;

      let telemetry: {
        hits?: string;
        cacheHitRatio?: string;
        durationUs?: string;
      } | null = null;

      let apiLatencyUs = localDurationUs;
      let usedSource: "api" | "client_engine" = "client_engine";

      if (environment?.apiKey) {
        try {
          const res = await fetch("/api/v1/evaluate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-environment-key": environment.apiKey,
            },
            body: JSON.stringify({
              userId: trimmedUserId,
              flagKey: flagKeyToEval,
              attributes: userAttributes,
            }),
          });

          if (res.ok) {
            const hits = res.headers.get("x-flagops-hits") || "1";
            const cacheHitRatio = res.headers.get("x-flagops-cache-hit-ratio") || "1.0";
            const headerDuration = res.headers.get("x-flagops-duration-us");
            if (headerDuration) {
              apiLatencyUs = parseFloat(headerDuration);
            }
            telemetry = {
              hits,
              cacheHitRatio,
              durationUs: String(apiLatencyUs),
            };

            const data = await res.json();
            const flagResult = data[flagKeyToEval] || data;
            if (flagResult && typeof flagResult === "object" && "enabled" in flagResult) {
              serverResponseData = flagResult;
              usedSource = "api";
            }
          }
        } catch (fetchErr) {
          console.warn("[SdkTesterModal] API call skipped or returned network error, using local engine:", fetchErr);
        }
      }

      // 6. Merge results for comprehensive display
      const isEnabled = serverResponseData?.enabled ?? clientEval.enabled;
      const evaluatedVal =
        serverResponseData?.value !== undefined
          ? serverResponseData.value
          : clientEval.value;
      const reason =
        serverResponseData?.reason ||
        clientEval.reason ||
        (isEnabled ? "ROLLOUT_MATCH" : "ROLLOUT_EXCLUDED");
      const matchedRuleId =
        serverResponseData?.matchedRuleId || currentRule?.id || undefined;
      const finalRollout =
        serverResponseData?.rolloutPercentage ??
        currentRule?.rolloutPercentage ??
        100;
      const finalBucket =
        serverResponseData?.bucket !== undefined
          ? serverResponseData.bucket
          : bucket;

      setEvalResult({
        flagKey: flagKeyToEval,
        enabled: isEnabled,
        value: evaluatedVal,
        reason,
        matchedRuleId,
        bucket: finalBucket,
        rolloutPercentage: finalRollout,
        hashUint32: hash32,
        hashHex,
        inputKey: combined,
        durationUs: apiLatencyUs,
        durationNs: localDurationNs,
        source: usedSource,
        telemetryStats: telemetry,
        segmentEvaluations,
        allSegmentsMatched,
      });
    } catch (err: unknown) {
      console.error("[SdkTesterModal] Evaluation exception:", err);
      setEvalError(err instanceof Error ? err.message : "Evaluation failed unexpectedly.");
    } finally {
      setIsEvaluating(false);
    }
  }, [
    activeFlagKey,
    userKey,
    userEmail,
    userCountry,
    userBetaGroup,
    userTier,
    currentFlag,
    currentRule,
    environment?.apiKey,
  ]);

  // Code snippets for copy/paste
  const codeSnippets = useMemo(() => {
    const apiKey = environment?.apiKey || "flagops_env_prod_xxx";
    return {
      sdk: `// FlagOps In-Memory TypeScript SDK (<1ms synchronous evaluation)
import { FlagOpsClient } from "@flagops/sdk";

const flagops = new FlagOpsClient("${apiKey}", {
  baseUrl: "http://localhost:3000",
});

await flagops.waitForReady();

// Zero network calls during evaluation - evaluates from RAM in microseconds!
const isEnabled = flagops.isEnabled("${activeFlagKey}", {
  userId: "${userKey}",
  attributes: {
    country: "${userCountry}",
    email: "${userEmail}",
    betaGroup: "${userBetaGroup}",
    tier: "${userTier}"
  }
});

console.log("${activeFlagKey}:", isEnabled);`,
      react: `// FlagOps React Hook
import { useFeatureFlag } from "@flagops/react";

export function FlagAwareComponent() {
  const { isEnabled, value } = useFeatureFlag("${activeFlagKey}", {
    userId: "${userKey}",
    attributes: { country: "${userCountry}", tier: "${userTier}" }
  });

  if (!isEnabled) {
    return <StandardFallbackView />;
  }
  return <NewFeatureView data={value} />;
}`,
      node: `// Node.js Direct Batch API Evaluation
const response = await fetch("http://localhost:3000/api/v1/evaluate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-environment-key": "${apiKey}",
  },
  body: JSON.stringify({
    userId: "${userKey}",
    flagKey: "${activeFlagKey}",
    attributes: {
      country: "${userCountry}",
      email: "${userEmail}",
      tier: "${userTier}"
    }
  }),
});

const flags = await response.json();
console.log("${activeFlagKey}:", flags["${activeFlagKey}"]);`,
      curl: `curl -X POST http://localhost:3000/api/v1/evaluate \\
  -H "x-environment-key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "${userKey}",
    "flagKey": "${activeFlagKey}",
    "attributes": {
      "country": "${userCountry}",
      "email": "${userEmail}",
      "betaGroup": "${userBetaGroup}",
      "tier": "${userTier}"
    }
  }'`,
    };
  }, [
    environment?.apiKey,
    activeFlagKey,
    userKey,
    userCountry,
    userEmail,
    userBetaGroup,
    userTier,
  ]);

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(codeSnippets[snippetTab]);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-blue-400" />
          <span>Live SDK Evaluation Simulator</span>
        </div>
      }
      description="Simulate real-time flag evaluation for any user context using FlagOps consistent hashing and targeting engine."
    >
      <div className="space-y-5">
        {/* Flag & Env Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Select Feature Flag
            </label>
            <select
              value={activeFlagKey}
              onChange={(e) => {
                setSelectedFlagKey(e.target.value);
                setEvalResult(null);
                setEvalError(null);
              }}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              {flags.length === 0 ? (
                <option value="">No feature flags available</option>
              ) : (
                flags.map((f) => (
                  <option key={f.id} value={f.key}>
                    {f.key} ({f.flagType})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Active Environment
            </label>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="font-semibold text-white truncate">
                {environment?.name || "Production"}
              </span>
              <span className="text-[10px] text-slate-500 font-mono truncate">
                ({(environment?.apiKey || "flagops_env_...").slice(0, 18)}...)
              </span>
            </div>
          </div>
        </div>

        {/* User Context Simulator Inputs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Simulated User Context
            </h4>
            <span className="text-[10px] text-slate-500">
              Attributes used for targeting segments & consistent MurmurHash3 bucketing
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">User Key (ID)</label>
              <input
                type="text"
                value={userKey}
                onChange={(e) => setUserKey(e.target.value)}
                placeholder="user_123"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Email</label>
              <input
                type="text"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="alice@example.com"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Country</label>
              <input
                type="text"
                value={userCountry}
                onChange={(e) => setUserCountry(e.target.value)}
                placeholder="US"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Beta Group</label>
              <input
                type="text"
                value={userBetaGroup}
                onChange={(e) => setUserBetaGroup(e.target.value)}
                placeholder="early_adopters"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Tier</label>
              <input
                type="text"
                value={userTier}
                onChange={(e) => setUserTier(e.target.value)}
                placeholder="enterprise"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="w-full cursor-pointer font-semibold shadow-md shadow-blue-500/20"
                isLoading={isEvaluating}
                onClick={handleEvaluate}
                disabled={!activeFlagKey}
              >
                <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                Evaluate Flag
              </Button>
            </div>
          </div>
        </div>

        {/* Optional Error Alert */}
        {evalError && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{evalError}</span>
          </div>
        )}

        {/* Evaluation Result View Directly Below Button */}
        {evalResult && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4 animate-in fade-in duration-200">
            {/* Header: Status Pill, Flag Key & Source Badge */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex items-center gap-2 px-3 py-1 rounded-full font-bold text-xs tracking-wide border shadow-sm ${
                    evalResult.enabled
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-emerald-500/10"
                      : "bg-rose-500/15 border-rose-500/40 text-rose-400 shadow-rose-500/10"
                  }`}
                >
                  {evalResult.enabled ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>STATUS: {evalResult.enabled ? "ENABLED" : "DISABLED"}</span>
                </div>

                <Badge
                  variant={evalResult.enabled ? "success" : "danger"}
                  size="sm"
                >
                  {evalResult.reason}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                  <Cpu className="w-3 h-3 text-blue-400" />
                  {evalResult.source === "api" ? "Server Edge Engine" : "Client SDK Engine"}
                </span>
                <span className="text-slate-300 font-semibold">{evalResult.flagKey}</span>
              </div>
            </div>

            {/* Core Metrics: Evaluated Value, Evaluation Latency, Matched Rule */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Evaluated Value */}
              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/90 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Evaluated Value
                  </span>
                  <Badge variant="outline" size="sm" className="text-[9px] px-1.5 py-0">
                    {currentFlag?.flagType || (typeof evalResult.value).toUpperCase()}
                  </Badge>
                </div>
                <div className="mt-1">
                  {typeof evalResult.value === "boolean" ? (
                    <span
                      className={`inline-block font-mono text-sm font-bold px-2.5 py-0.5 rounded ${
                        evalResult.value
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {String(evalResult.value)}
                    </span>
                  ) : typeof evalResult.value === "object" && evalResult.value !== null ? (
                    <pre className="font-mono text-xs text-blue-300 bg-slate-950 p-1.5 rounded border border-slate-800 overflow-x-auto max-h-20">
                      {JSON.stringify(evalResult.value, null, 2)}
                    </pre>
                  ) : (
                    <span className="font-mono text-sm font-bold text-white break-all">
                      {JSON.stringify(evalResult.value) ?? "null"}
                    </span>
                  )}
                </div>
              </div>

              {/* Evaluation Time in Nanoseconds / Microseconds */}
              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/90 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Evaluation Time
                  </span>
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-mono text-lg font-extrabold text-white">
                    {evalResult.durationUs}
                  </span>
                  <span className="font-mono text-xs font-semibold text-blue-400">μs</span>
                  {evalResult.durationNs && (
                    <span className="text-[10px] text-slate-500 font-mono ml-1">
                      (~{evalResult.durationNs} ns)
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 mt-1">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>Ultra-low latency RAM evaluation</span>
                </div>
              </div>

              {/* Matched Targeting Rule */}
              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/90 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Matched Targeting Rule
                  </span>
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="mt-1">
                  <div className="font-mono text-xs text-white truncate font-medium">
                    {evalResult.matchedRuleId ? (
                      <span title={evalResult.matchedRuleId}>
                        rule_{evalResult.matchedRuleId.slice(0, 12)}...
                      </span>
                    ) : (
                      <span className="text-slate-400">Default Baseline Rule</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Rollout target: {evalResult.rolloutPercentage}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* MurmurHash3 Consistent Hashing Bucket Calculation Details */}
            <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-white">
                    MurmurHash3 (x86 32-bit) Consistent Hashing Calculation
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Formula:{" "}
                  <code className="text-blue-300 font-bold">
                    murmurHash3(flagKey + &quot;:&quot; + userId) % 100
                  </code>
                </span>
              </div>

              {/* Hash Computation Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px]">Hash Input Key</span>
                  <span className="text-white truncate block font-semibold" title={evalResult.inputKey}>
                    {evalResult.inputKey}
                  </span>
                </div>

                <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px]">32-bit Hash (Hex)</span>
                  <span className="text-purple-300 block font-semibold">{evalResult.hashHex}</span>
                </div>

                <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px]">User Hash Bucket</span>
                  <span className="text-amber-300 font-bold block">
                    {evalResult.bucket} <span className="text-slate-500 font-normal">/ 100</span>
                  </span>
                </div>

                <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px]">Rollout Threshold</span>
                  <span className="text-blue-400 font-bold block">{evalResult.rolloutPercentage}%</span>
                </div>
              </div>

              {/* Visual Percentage Meter Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>0%</span>
                  <span className="text-blue-400 font-semibold">
                    Rollout Threshold: {evalResult.rolloutPercentage}%
                  </span>
                  <span>100%</span>
                </div>

                {/* Progress bar with bucket indicator */}
                <div className="relative h-3 w-full bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
                  {/* Threshold Active Zone */}
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-blue-600/30 via-indigo-600/40 to-blue-500/50"
                    style={{ width: `${Math.min(100, Math.max(0, evalResult.rolloutPercentage))}%` }}
                  />

                  {/* Threshold Divider Marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-10"
                    style={{ left: `${Math.min(100, Math.max(0, evalResult.rolloutPercentage))}%` }}
                  />

                  {/* User Bucket Point Marker */}
                  <div
                    className={`absolute top-0.5 bottom-0.5 w-2 rounded-full -ml-1 z-20 shadow-md ${
                      evalResult.bucket < evalResult.rolloutPercentage
                        ? "bg-emerald-400 ring-2 ring-emerald-500/40"
                        : "bg-rose-400 ring-2 ring-rose-500/40"
                    }`}
                    style={{ left: `${Math.min(99, Math.max(1, evalResult.bucket))}%` }}
                    title={`User bucket: ${evalResult.bucket}`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono text-[10px]">
                    {evalResult.bucket < evalResult.rolloutPercentage ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCheck className="w-3.5 h-3.5" />
                        Bucket {evalResult.bucket} &lt; {evalResult.rolloutPercentage}% threshold → INCLUDED
                        in progressive rollout.
                      </span>
                    ) : (
                      <span className="text-rose-400 font-semibold flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        Bucket {evalResult.bucket} &ge; {evalResult.rolloutPercentage}% threshold → EXCLUDED
                        from progressive rollout.
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Deterministic: identical userId produces identical variation
                  </span>
                </div>
              </div>
            </div>

            {/* Segment Targeting Breakdown */}
            {evalResult.segmentEvaluations.length > 0 && (
              <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    Targeting Segment Rules Breakdown ({evalResult.segmentEvaluations.length} condition
                    {evalResult.segmentEvaluations.length > 1 ? "s" : ""})
                  </span>
                  <Badge
                    variant={evalResult.allSegmentsMatched ? "success" : "danger"}
                    size="sm"
                  >
                    {evalResult.allSegmentsMatched
                      ? "ALL CONDITIONS MET"
                      : "SEGMENT MISMATCH"}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  {evalResult.segmentEvaluations.map((seg, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80"
                    >
                      <div className="flex items-center gap-2">
                        {seg.matched ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <span className="text-slate-300">
                          <strong className="text-white">{seg.attribute}</strong>{" "}
                          <span className="text-blue-400">{seg.operator}</span>{" "}
                          <span className="text-amber-300">&quot;{String(seg.expected)}&quot;</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-[11px]">
                          User actual: <strong className="text-slate-300">&quot;{String(seg.actual)}&quot;</strong>
                        </span>
                        <Badge variant={seg.matched ? "success" : "danger"} size="sm">
                          {seg.matched ? "PASS" : "FAIL"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Telemetry Metrics Bar */}
            {evalResult.telemetryStats && (
              <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Engine Latency:{" "}
                  <strong className="text-white font-bold">{evalResult.telemetryStats.durationUs} μs</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Cache Hit Ratio:{" "}
                  <strong className="text-emerald-400 font-bold">
                    {(parseFloat(evalResult.telemetryStats.cacheHitRatio || "1") * 100).toFixed(0)}%
                  </strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  Server Hits:{" "}
                  <strong className="text-white font-bold">{evalResult.telemetryStats.hits}</strong>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Integration Code Snippet */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {(["sdk", "react", "node", "curl"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSnippetTab(tab)}
                  className={`px-2.5 py-1 text-xs rounded-md font-mono transition-colors cursor-pointer ${
                    snippetTab === tab
                      ? "bg-slate-800 text-white font-semibold border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab === "sdk"
                    ? "@flagops/sdk (In-Memory)"
                    : tab === "react"
                    ? "React Hook"
                    : tab === "node"
                    ? "Batch API"
                    : "cURL"}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopySnippet}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {copiedSnippet ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedSnippet ? "Copied" : "Copy"}</span>
            </button>
          </div>

          <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 text-slate-300 font-mono text-[11px] overflow-x-auto leading-relaxed">
            {codeSnippets[snippetTab]}
          </pre>
        </div>
      </div>
    </Dialog>
  );
};
