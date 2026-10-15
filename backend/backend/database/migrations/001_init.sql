-- WebPoint Lead Generation Platform - initial schema (MySQL 8+)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(191) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE workspaces (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  max_results_per_search INT NOT NULL DEFAULT 200,
  daily_search_quota INT NOT NULL DEFAULT 50,
  daily_export_quota INT NOT NULL DEFAULT 20,
  monthly_api_budget_usd DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner','admin','analyst','viewer') NOT NULL DEFAULT 'analyst',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_workspace (workspace_id),
  CONSTRAINT fk_users_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE refresh_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  family_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  replaced_by CHAR(36) NULL,
  user_agent VARCHAR(255) NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_refresh_hash (token_hash),
  KEY idx_refresh_user (user_id),
  KEY idx_refresh_family (family_id),
  KEY idx_refresh_expires (expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Per-workspace compliance/retention/attribution override for every source integration.
CREATE TABLE source_configs (
  workspace_id CHAR(36) NOT NULL,
  source VARCHAR(40) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  retention_days INT NULL,
  notes VARCHAR(500) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id, source),
  CONSTRAINT fk_srccfg_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE search_jobs (
  id CHAR(36) PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(100) NULL,
  category VARCHAR(120) NOT NULL,
  location VARCHAR(160) NOT NULL,
  source VARCHAR(40) NOT NULL,
  filters JSON NOT NULL,
  result_limit INT NOT NULL DEFAULT 60,
  enrich TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('QUEUED','RUNNING','COLLECTING','NORMALIZING','DEDUPLICATING','ENRICHING','COMPLETED','RETRYING','FAILED','CANCEL_REQUESTED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  metrics JSON NOT NULL,
  error_message VARCHAR(500) NULL,
  attempts INT NOT NULL DEFAULT 0,
  cancel_requested TINYINT(1) NOT NULL DEFAULT 0,
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_jobs_idem (workspace_id, idempotency_key),
  KEY idx_jobs_ws_created (workspace_id, created_at),
  KEY idx_jobs_status (status),
  CONSTRAINT fk_jobs_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_jobs_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE businesses (
  id CHAR(36) PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  category VARCHAR(120) NOT NULL,
  normalized_category VARCHAR(120) NOT NULL,
  address VARCHAR(500) NULL,
  normalized_address VARCHAR(255) NULL,
  city_area VARCHAR(160) NULL,
  normalized_city VARCHAR(160) NULL,
  phone VARCHAR(40) NULL,
  phone_normalized VARCHAR(20) NULL,
  phone_hash CHAR(64) NULL,
  website VARCHAR(500) NULL,
  website_domain VARCHAR(255) NULL,
  facebook_url VARCHAR(500) NULL,
  instagram_url VARCHAR(500) NULL,
  other_socials JSON NULL,
  rating DECIMAL(2,1) NULL,
  review_count INT NULL,
  rating_source VARCHAR(40) NULL,
  open_status VARCHAR(30) NULL,
  fingerprint CHAR(64) NOT NULL,
  verification_status ENUM('verified','likely','unresolved') NOT NULL DEFAULT 'unresolved',
  lead_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
  qualification JSON NULL,
  review_flags JSON NULL,
  notes TEXT NULL,
  archived_at DATETIME(3) NULL,
  enriched_at DATETIME(3) NULL,
  last_checked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_biz_fingerprint (workspace_id, fingerprint),
  KEY idx_biz_category (workspace_id, normalized_category),
  KEY idx_biz_city (workspace_id, normalized_city),
  KEY idx_biz_domain (workspace_id, website_domain),
  KEY idx_biz_phone_hash (workspace_id, phone_hash),
  KEY idx_biz_name (workspace_id, normalized_name),
  KEY idx_biz_created (workspace_id, created_at),
  KEY idx_biz_updated (workspace_id, updated_at),
  CONSTRAINT fk_biz_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE business_sources (
  id CHAR(36) PRIMARY KEY,
  business_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  source VARCHAR(40) NOT NULL,
  source_record_id VARCHAR(255) NOT NULL,
  source_url VARCHAR(1000) NULL,
  attribution VARCHAR(500) NULL,
  rating DECIMAL(2,1) NULL,
  review_count INT NULL,
  raw_payload JSON NULL,
  retrieved_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NULL,
  refresh_state ENUM('fresh','stale','purged') NOT NULL DEFAULT 'fresh',
  UNIQUE KEY uq_bsrc (workspace_id, source, source_record_id),
  KEY idx_bsrc_business (business_id),
  KEY idx_bsrc_expiry (expires_at, refresh_state),
  CONSTRAINT fk_bsrc_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE business_contacts (
  id CHAR(36) PRIMARY KEY,
  business_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  kind ENUM('phone','email') NOT NULL,
  value VARCHAR(255) NOT NULL,
  normalized_value VARCHAR(255) NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  source VARCHAR(40) NOT NULL,
  evidence_url VARCHAR(1000) NULL,
  retrieved_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_contact (business_id, kind, normalized_value),
  KEY idx_contact_ws (workspace_id),
  CONSTRAINT fk_contact_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE business_socials (
  id CHAR(36) PRIMARY KEY,
  business_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  platform VARCHAR(30) NOT NULL,
  url VARCHAR(500) NOT NULL,
  url_hash CHAR(64) NOT NULL,
  source VARCHAR(40) NOT NULL,
  evidence_url VARCHAR(1000) NULL,
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  ai_generated TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_social (business_id, platform, url_hash),
  KEY idx_social_ws (workspace_id),
  CONSTRAINT fk_social_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE job_businesses (
  job_id CHAR(36) NOT NULL,
  business_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  is_new TINYINT(1) NOT NULL DEFAULT 1,
  matches_filters TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (job_id, business_id),
  KEY idx_jb_business (business_id),
  CONSTRAINT fk_jb_job FOREIGN KEY (job_id) REFERENCES search_jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_jb_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lead_lists (
  id CHAR(36) PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_list_name (workspace_id, name),
  CONSTRAINT fk_list_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lead_list_items (
  lead_list_id CHAR(36) NOT NULL,
  business_id CHAR(36) NOT NULL,
  added_by CHAR(36) NOT NULL,
  added_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (lead_list_id, business_id),
  KEY idx_lli_business (business_id),
  CONSTRAINT fk_lli_list FOREIGN KEY (lead_list_id) REFERENCES lead_lists(id) ON DELETE CASCADE,
  CONSTRAINT fk_lli_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tags (
  id CHAR(36) PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  name VARCHAR(60) NOT NULL,
  color VARCHAR(9) NOT NULL DEFAULT '#1F4FD8',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tag (workspace_id, name),
  CONSTRAINT fk_tag_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE business_tags (
  business_id CHAR(36) NOT NULL,
  tag_id CHAR(36) NOT NULL,
  PRIMARY KEY (business_id, tag_id),
  KEY idx_bt_tag (tag_id),
  CONSTRAINT fk_bt_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_bt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE exports (
  id CHAR(36) PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(100) NULL,
  status ENUM('QUEUED','RUNNING','COMPLETED','FAILED','EXPIRED') NOT NULL DEFAULT 'QUEUED',
  selection JSON NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  progress INT NOT NULL DEFAULT 0,
  file_name VARCHAR(255) NULL,
  file_path VARCHAR(500) NULL,
  file_size BIGINT NULL,
  download_token_hash CHAR(64) NULL,
  download_expires_at DATETIME(3) NULL,
  download_used_at DATETIME(3) NULL,
  error_message VARCHAR(500) NULL,
  expires_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_exports_idem (workspace_id, idempotency_key),
  KEY idx_exports_ws (workspace_id, created_at),
  KEY idx_exports_expiry (status, expires_at),
  CONSTRAINT fk_exports_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NULL,
  entity_id VARCHAR(64) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  metadata JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_ws_created (workspace_id, created_at),
  KEY idx_audit_ws_action (workspace_id, action),
  KEY idx_audit_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE api_usage (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  job_id CHAR(36) NULL,
  source VARCHAR(40) NOT NULL,
  endpoint VARCHAR(80) NOT NULL,
  requests INT NOT NULL DEFAULT 1,
  estimated_cost_usd DECIMAL(10,5) NOT NULL DEFAULT 0,
  status_code INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_usage_ws_created (workspace_id, created_at),
  KEY idx_usage_source_created (source, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Every AI-generated field is recorded here with model/prompt version, evidence and confidence.
CREATE TABLE ai_annotations (
  id CHAR(36) PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  business_id CHAR(36) NULL,
  field_name VARCHAR(60) NOT NULL,
  value TEXT NOT NULL,
  ai_generated TINYINT(1) NOT NULL DEFAULT 1,
  model VARCHAR(80) NOT NULL,
  prompt_version VARCHAR(40) NOT NULL,
  source_evidence JSON NULL,
  confidence DECIMAL(3,2) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ai_business (business_id),
  KEY idx_ai_ws (workspace_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
