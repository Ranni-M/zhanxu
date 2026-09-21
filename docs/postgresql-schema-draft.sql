-- Proposed PostgreSQL schema. Not connected to the frontend yet.
BEGIN;
CREATE TABLE users (
 id uuid PRIMARY KEY,
 auth_subject text NOT NULL UNIQUE,
 display_name varchar(80) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE projects (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id),
 title varchar(120) NOT NULL,
 document jsonb NOT NULL DEFAULT '{}'::jsonb,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 template_id text NOT NULL CHECK (template_id IN ('editorial','gallery','bold')),
 template_version integer NOT NULL DEFAULT 1 CHECK (template_version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_owner_updated ON projects(owner_id, updated_at DESC);
CREATE TABLE assets (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 object_key text NOT NULL UNIQUE,
 original_name text NOT NULL,
 mime_type text NOT NULL,
 byte_size bigint NOT NULL CHECK (byte_size > 0),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assets_project ON assets(project_id);
CREATE TABLE generation_jobs (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 project_revision integer NOT NULL CHECK (project_revision > 0),
 input_snapshot jsonb NOT NULL,
 kind text NOT NULL CHECK (kind IN ('cover','long')),
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
 progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
 attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
 lease_expires_at timestamptz,
 result_key text,
 error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id, project_revision, kind)
);
CREATE INDEX jobs_pending ON generation_jobs(status, created_at) WHERE status IN ('queued','running');
CREATE TABLE publications (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 slug varchar(100) NOT NULL UNIQUE,
 snapshot jsonb NOT NULL,
 is_live boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX publications_project ON publications(project_id);
COMMIT;
