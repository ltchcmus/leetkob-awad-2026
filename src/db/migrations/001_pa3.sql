CREATE TABLE users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','ta','student'))
) STRICT;
CREATE TABLE classes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200)
) STRICT;
CREATE TABLE enrollments (
  class_id INTEGER NOT NULL REFERENCES classes(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (class_id, student_id)
) STRICT;
CREATE TABLE lab_details (
  lab_id INTEGER PRIMARY KEY REFERENCES labs(id),
  statement TEXT NOT NULL,
  cpu_ms INTEGER NOT NULL CHECK (cpu_ms BETWEEN 1000 AND 5000),
  wall_ms INTEGER NOT NULL,
  memory_mb INTEGER NOT NULL CHECK (memory_mb BETWEEN 64 AND 512),
  processes INTEGER NOT NULL CHECK (processes = 16),
  output_bytes INTEGER NOT NULL CHECK (output_bytes = 1048576),
  compile_ms INTEGER NOT NULL CHECK (compile_ms = 10000),
  CHECK (wall_ms = cpu_ms * 3)
) STRICT;
CREATE TABLE lab_constraints (
  lab_id INTEGER NOT NULL REFERENCES labs(id),
  constraint_id TEXT NOT NULL,
  text TEXT NOT NULL,
  deduction_tenths INTEGER NOT NULL CHECK (deduction_tenths BETWEEN 0 AND 100),
  position INTEGER NOT NULL,
  PRIMARY KEY (lab_id, constraint_id),
  UNIQUE (lab_id, position)
) STRICT;
CREATE TABLE lab_tests (
  lab_id INTEGER NOT NULL REFERENCES labs(id),
  position INTEGER NOT NULL,
  input TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  PRIMARY KEY (lab_id, position)
) STRICT;
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  lab_id INTEGER NOT NULL REFERENCES labs(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  counted_id INTEGER NOT NULL REFERENCES counted_submissions(id),
  sequence INTEGER NOT NULL,
  source TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  judge_status TEXT CHECK (judge_status IN ('AC','WA','TLE','MLE','RE','CE')),
  test_results TEXT NOT NULL DEFAULT '[]',
  checker_status TEXT NOT NULL DEFAULT 'pending' CHECK (checker_status IN ('pending','running','complete','not_required')),
  review_initialized INTEGER NOT NULL DEFAULT 0 CHECK (review_initialized IN (0,1)),
  UNIQUE (lab_id, student_id, sequence)
) STRICT;
CREATE TABLE counted_heads (
  counted_id INTEGER PRIMARY KEY REFERENCES counted_submissions(id),
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id)
) STRICT;
CREATE TABLE submission_requests (
  student_id TEXT NOT NULL REFERENCES users(id),
  lab_id INTEGER NOT NULL REFERENCES labs(id),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  receipt TEXT NOT NULL,
  PRIMARY KEY (student_id, lab_id, idempotency_key)
) STRICT;
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
  state TEXT NOT NULL CHECK (state IN ('queued','leased','retry_wait','completed','failed')),
  available_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  lease_token TEXT,
  lease_owner TEXT,
  lease_expires_at INTEGER,
  last_error_code TEXT,
  CHECK ((state = 'leased' AND lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR (state <> 'leased' AND lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL))
) STRICT;
CREATE INDEX jobs_available ON jobs(state, available_at);
CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  number INTEGER NOT NULL,
  lease_token TEXT NOT NULL UNIQUE,
  worker_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('active','completed','infrastructure_error','lease_expired')),
  error_code TEXT,
  UNIQUE (job_id, number)
) STRICT;
CREATE TABLE verdict_sets (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id),
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  completed_at INTEGER NOT NULL
) STRICT;
CREATE TABLE verdicts (
  submission_id TEXT NOT NULL REFERENCES verdict_sets(submission_id),
  lab_id INTEGER NOT NULL,
  constraint_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass','violation','unsure')),
  origin TEXT NOT NULL CHECK (origin IN ('hard-rule','model','guardrail')),
  evidence TEXT NOT NULL,
  reason TEXT,
  PRIMARY KEY (submission_id, constraint_id),
  FOREIGN KEY (lab_id, constraint_id) REFERENCES lab_constraints(lab_id, constraint_id)
) STRICT;
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  constraint_id TEXT NOT NULL,
  decision TEXT CHECK (decision IN ('pass','violation')),
  evidence TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL DEFAULT '',
  reviewer_id TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (submission_id, constraint_id),
  FOREIGN KEY (submission_id, constraint_id) REFERENCES verdicts(submission_id, constraint_id)
) STRICT;
CREATE TABLE review_audit (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  previous_decision TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('pass','violation')),
  evidence TEXT NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL,
  version INTEGER NOT NULL,
  UNIQUE (review_id, version)
) STRICT;
CREATE TABLE model_call_metadata (
  provider_request_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  cost_microusd INTEGER NOT NULL CHECK (cost_microusd >= 0)
) STRICT;
