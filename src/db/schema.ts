import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  avatarHue: integer("avatar_hue").notNull().default(100),
  githubToken: text("github_token"),
  githubUsername: text("github_username"),
  githubAvatarUrl: text("github_avatar_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    githubUrl: text("github_url").notNull(),
    branch: text("branch").notNull().default("main"),
    description: text("description"),
    status: text("status").notNull().default("pending"),
    languageStats: jsonb("language_stats").$type<Record<string, number>>(),
    totalFiles: integer("total_files").notNull().default(0),
    totalFunctions: integer("total_functions").notNull().default(0),
    totalApis: integer("total_apis").notNull().default(0),
    totalDependencies: integer("total_dependencies").notNull().default(0),
    lastAnalyzedAt: timestamp("last_analyzed_at"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("repositories_user_idx").on(t.userId)]
);

export const repoFiles = pgTable(
  "repo_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    language: text("language").notNull(),
    content: text("content").notNull(),
    loc: integer("loc").notNull().default(0),
    status: text("status").notNull().default("analyzed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("repo_files_repo_idx").on(t.repositoryId)]
);

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => repoFiles.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    qualifiedName: text("qualified_name").notNull(),
    filePath: text("file_path").notNull(),
    lineStart: integer("line_start").notNull().default(1),
    lineEnd: integer("line_end").notNull().default(1),
    signature: text("signature"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("entities_repo_idx").on(t.repositoryId),
    index("entities_name_idx").on(t.name),
    index("entities_type_idx").on(t.type),
  ]
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => entities.id, {
      onDelete: "cascade",
    }),
    sourceName: text("source_name").notNull(),
    sourceFile: text("source_file").notNull(),
    targetName: text("target_name").notNull(),
    targetId: uuid("target_id").references(() => entities.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    confidence: text("confidence").notNull().default("high"),
    lineNo: integer("line_no"),
    snippet: text("snippet"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("relationships_repo_idx").on(t.repositoryId),
    index("relationships_source_idx").on(t.sourceId),
    index("relationships_type_idx").on(t.type),
  ]
);

export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("completed"),
    commitSha: text("commit_sha"),
    stats: jsonb("stats").$type<Record<string, number>>(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("analyses_repo_idx").on(t.repositoryId)]
);

export const changes = pgTable(
  "changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id").references(() => analyses.id, {
      onDelete: "cascade",
    }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    symbol: text("symbol").notNull(),
    changeType: text("change_type").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("changes_repo_idx").on(t.repositoryId)]
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id").references(() => analyses.id, {
      onDelete: "cascade",
    }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    changeId: uuid("change_id").references(() => changes.id, {
      onDelete: "set null",
    }),
    ruleId: text("rule_id").notNull(),
    severity: text("severity").notNull().default("medium"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    evidence: jsonb("evidence").$type<{
      files: string[];
      symbols: string[];
      lines?: Array<{ file: string; line: number; snippet: string }>;
      relationship?: string;
      suggestion?: string;
    }>(),
    filePath: text("file_path").notNull(),
    symbol: text("symbol"),
    lineStart: integer("line_start"),
    lineEnd: integer("line_end"),
    status: text("status").notNull().default("open"),
    aiExplanation: text("ai_explanation"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("findings_repo_idx").on(t.repositoryId),
    index("findings_analysis_idx").on(t.analysisId),
    index("findings_severity_idx").on(t.severity),
  ]
);

export const cleanupItems = pgTable(
  "cleanup_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id").references(() => analyses.id, {
      onDelete: "cascade",
    }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    target: text("target").notNull(),
    filePath: text("file_path").notNull(),
    confidence: text("confidence").notNull().default("high"),
    description: text("description").notNull(),
    preview: text("preview"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("cleanup_repo_idx").on(t.repositoryId)]
);

export type User = typeof users.$inferSelect;
export type Repository = typeof repositories.$inferSelect;
export type RepoFile = typeof repoFiles.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type Relationship = typeof relationships.$inferSelect;
export type Analysis = typeof analyses.$inferSelect;
export type Change = typeof changes.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type CleanupItem = typeof cleanupItems.$inferSelect;
