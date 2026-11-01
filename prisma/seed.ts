import { PrismaClient, FlagType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting FlagOps database seeding...");

  // Clean existing records in correct relation order
  await prisma.auditLog.deleteMany();
  await prisma.targetingRule.deleteMany();
  await prisma.featureFlag.deleteMany();
  await prisma.environment.deleteMany();
  await prisma.project.deleteMany();

  // 1. Create Core Projects
  const coreProject = await prisma.project.create({
    data: {
      name: "Acme Platform Core",
      slug: "acme-core",
    },
  });

  const mobileProject = await prisma.project.create({
    data: {
      name: "Mobile Consumer App",
      slug: "mobile-consumer",
    },
  });

  console.log(`✓ Created 2 projects: ${coreProject.name}, ${mobileProject.name}`);

  // 2. Create Environments for Core Project
  const prodEnv = await prisma.environment.create({
    data: {
      projectId: coreProject.id,
      name: "Production",
      apiKey: "flagops_env_prod_8f39a04b1c78e9f2a0e718b5239",
    },
  });

  const stagingEnv = await prisma.environment.create({
    data: {
      projectId: coreProject.id,
      name: "Staging",
      apiKey: "flagops_env_stage_2c94d01e4a77b8c3d9f102a3941",
    },
  });

  const devEnv = await prisma.environment.create({
    data: {
      projectId: coreProject.id,
      name: "Development",
      apiKey: "flagops_env_dev_5e11b89a0f44e1c9d8a342b5890",
    },
  });

  // Create Environments for Mobile Project
  await prisma.environment.createMany({
    data: [
      {
        projectId: mobileProject.id,
        name: "Production",
        apiKey: "flagops_env_mobile_prod_90234a1b",
      },
      {
        projectId: mobileProject.id,
        name: "TestFlight / Staging",
        apiKey: "flagops_env_mobile_stage_11942c3d",
      },
      {
        projectId: mobileProject.id,
        name: "Local Development",
        apiKey: "flagops_env_mobile_dev_77610e5f",
      },
    ],
  });

  console.log("✓ Created environments for both projects");

  // 3. Create Feature Flags for Core Project
  // Flag 1: new-checkout-flow (BOOLEAN)
  const flagCheckout = await prisma.featureFlag.create({
    data: {
      projectId: coreProject.id,
      key: "new-checkout-flow",
      description: "Stripe Elements v3 with 1-click Apple Pay & Google Pay checkout",
      flagType: FlagType.BOOLEAN,
      defaultValue: false,
    },
  });

  // Flag 2: ai-search-ranking (BOOLEAN)
  const flagSearch = await prisma.featureFlag.create({
    data: {
      projectId: coreProject.id,
      key: "ai-search-ranking",
      description: "Hybrid vector + semantic search ranking for e-commerce catalog queries",
      flagType: FlagType.BOOLEAN,
      defaultValue: false,
    },
  });

  // Flag 3: rate-limit-policy (JSON)
  const flagRateLimit = await prisma.featureFlag.create({
    data: {
      projectId: coreProject.id,
      key: "rate-limit-policy",
      description: "Dynamic rate limiting tiers and burst allowance for public API endpoints",
      flagType: FlagType.JSON,
      defaultValue: {
        tier: "standard",
        requestsPerMin: 120,
        burst: 200,
        retryAfterSec: 15,
      },
    },
  });

  // Flag 4: max-upload-mb (STRING)
  const flagUpload = await prisma.featureFlag.create({
    data: {
      projectId: coreProject.id,
      key: "max-upload-mb",
      description: "Maximum payload file upload size threshold per organization tier",
      flagType: FlagType.STRING,
      defaultValue: "25MB",
    },
  });

  // Flag 5: multivariate-theme-experiment (MULTIVARIATE)
  const flagTheme = await prisma.featureFlag.create({
    data: {
      projectId: coreProject.id,
      key: "theme-variant-experiment",
      description: "A/B/n test for dashboard landing page color palette & typography",
      flagType: FlagType.MULTIVARIATE,
      defaultValue: {
        variant: "control",
        accent: "#3b82f6",
        contrast: "high",
      },
    },
  });

  console.log("✓ Created 5 feature flags");

  // 4. Create Targeting Rules for Flag 1 (new-checkout-flow)
  await prisma.targetingRule.createMany({
    data: [
      {
        flagId: flagCheckout.id,
        environmentId: prodEnv.id,
        enabled: true,
        rolloutPercentage: 35,
        userSegments: [
          {
            id: "seg_1",
            attribute: "country",
            operator: "is_one_of",
            value: "US, CA, GB",
          },
          {
            id: "seg_2",
            attribute: "betaGroup",
            operator: "equals",
            value: "early_adopters",
          },
        ],
      },
      {
        flagId: flagCheckout.id,
        environmentId: stagingEnv.id,
        enabled: true,
        rolloutPercentage: 100,
        userSegments: [
          {
            id: "seg_3",
            attribute: "email",
            operator: "contains",
            value: "@acme.com",
          },
        ],
      },
      {
        flagId: flagCheckout.id,
        environmentId: devEnv.id,
        enabled: true,
        rolloutPercentage: 100,
        userSegments: [],
      },
    ],
  });

  // Rules for AI Search
  await prisma.targetingRule.createMany({
    data: [
      {
        flagId: flagSearch.id,
        environmentId: prodEnv.id,
        enabled: false,
        rolloutPercentage: 0,
        userSegments: [
          {
            id: "seg_4",
            attribute: "userTier",
            operator: "equals",
            value: "enterprise",
          },
        ],
      },
      {
        flagId: flagSearch.id,
        environmentId: stagingEnv.id,
        enabled: true,
        rolloutPercentage: 50,
        userSegments: [],
      },
      {
        flagId: flagSearch.id,
        environmentId: devEnv.id,
        enabled: true,
        rolloutPercentage: 100,
        userSegments: [],
      },
    ],
  });

  // Rules for Rate Limit Policy
  await prisma.targetingRule.createMany({
    data: [
      {
        flagId: flagRateLimit.id,
        environmentId: prodEnv.id,
        enabled: true,
        rolloutPercentage: 100,
        userSegments: [],
      },
      {
        flagId: flagRateLimit.id,
        environmentId: stagingEnv.id,
        enabled: true,
        rolloutPercentage: 100,
        userSegments: [],
      },
      {
        flagId: flagRateLimit.id,
        environmentId: devEnv.id,
        enabled: true,
        rolloutPercentage: 100,
        userSegments: [],
      },
    ],
  });

  // Rules for Max Upload
  await prisma.targetingRule.createMany({
    data: [
      {
        flagId: flagUpload.id,
        environmentId: prodEnv.id,
        enabled: true,
        rolloutPercentage: 80,
        userSegments: [
          {
            id: "seg_5",
            attribute: "plan",
            operator: "not_equals",
            value: "free",
          },
        ],
      },
      {
        flagId: flagUpload.id,
        environmentId: stagingEnv.id,
        enabled: true,
        rolloutPercentage: 100,
        userSegments: [],
      },
      {
        flagId: flagUpload.id,
        environmentId: devEnv.id,
        enabled: true,
        rolloutPercentage: 100,
        userSegments: [],
      },
    ],
  });

  // Rules for Theme Experiment
  await prisma.targetingRule.createMany({
    data: [
      {
        flagId: flagTheme.id,
        environmentId: prodEnv.id,
        enabled: true,
        rolloutPercentage: 50,
        userSegments: [],
      },
      {
        flagId: flagTheme.id,
        environmentId: stagingEnv.id,
        enabled: true,
        rolloutPercentage: 100,
        userSegments: [],
      },
      {
        flagId: flagTheme.id,
        environmentId: devEnv.id,
        enabled: true,
        rolloutPercentage: 100,
        userSegments: [],
      },
    ],
  });

  console.log("✓ Created targeting rules across environments");

  // 5. Create realistic Audit Logs
  await prisma.auditLog.createMany({
    data: [
      {
        flagId: flagCheckout.id,
        modifiedBy: "sarah.devops@acme.com",
        diff: {
          action: "TARGETING_RULE_UPDATED",
          environment: "Production",
          changes: {
            rolloutPercentage: { before: 10, after: 35 },
            userSegments: { added: ["country IN (US, CA, GB)"] },
          },
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 35), // 35 mins ago
      },
      {
        flagId: flagCheckout.id,
        modifiedBy: "alex.techlead@acme.com",
        diff: {
          action: "FLAG_ENABLED",
          environment: "Production",
          status: "Active",
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 180), // 3 hours ago
      },
      {
        flagId: flagSearch.id,
        modifiedBy: "michael.infra@acme.com",
        diff: {
          action: "KILL_SWITCH_ENGAGED",
          environment: "Production",
          reason: "Vector DB latency spike observed during peak load",
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 95), // 95 mins ago
      },
      {
        flagId: flagRateLimit.id,
        modifiedBy: "system.ci@flagops.internal",
        diff: {
          action: "FLAG_CREATED",
          defaultValue: { tier: "standard", requestsPerMin: 120 },
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      },
    ],
  });

  console.log("✓ Created audit logs");
  console.log("🚀 FlagOps database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error during seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
