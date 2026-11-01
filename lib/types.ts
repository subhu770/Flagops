import { FeatureFlag, TargetingRule, Environment, Project, AuditLog } from "@prisma/client";

export type SegmentOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "matches_regex"
  | "is_one_of"
  | "greater_than"
  | "less_than";

export interface UserSegmentRule {
  id: string;
  attribute: string; // e.g. "email", "country", "betaGroup", "tier"
  operator: SegmentOperator;
  value: string;
}

export type FeatureFlagWithRules = FeatureFlag & {
  targetingRules: (TargetingRule & {
    environment: Environment;
  })[];
  project?: Project;
  auditLogs?: AuditLog[];
};

export type EnvironmentWithFlags = Environment & {
  targetingRules: TargetingRule[];
};

export type ProjectWithEnvironments = Project & {
  environments: Environment[];
  flags: FeatureFlag[];
};
