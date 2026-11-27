CREATE TABLE submission_snapshots (
 submission_id TEXT PRIMARY KEY REFERENCES submissions(id), version INTEGER NOT NULL DEFAULT 1,
 origin TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
CREATE VIEW current_lab_snapshots AS
 SELECT d.lab_id, json_object('statement',d.statement,
 'limits',json_object('cpuMs',d.cpu_ms,'wallMs',d.wall_ms,'memoryMb',d.memory_mb,'processes',d.processes,'outputBytes',d.output_bytes,'compileMs',d.compile_ms),
 'tests',json((SELECT json_group_array(json_object('input',input,'expectedOutput',expected_output)) FROM (SELECT * FROM lab_tests WHERE lab_id=d.lab_id ORDER BY position))),
 'constraints',json((SELECT json_group_array(json_object('id',constraint_id,'text',text,'deductionTenths',deduction_tenths)) FROM (SELECT * FROM lab_constraints WHERE lab_id=d.lab_id ORDER BY position)))) AS payload
 FROM lab_details d;
CREATE TRIGGER capture_submission_snapshot AFTER INSERT ON submissions BEGIN
 INSERT INTO submission_snapshots(submission_id,version,origin,payload)
 SELECT NEW.id,COALESCE(
 (SELECT snap.version FROM submission_snapshots snap JOIN submissions old ON old.id=snap.submission_id WHERE old.lab_id=NEW.lab_id AND snap.payload=current.payload LIMIT 1),
 (SELECT COALESCE(MAX(snap.version),0)+1 FROM submission_snapshots snap JOIN submissions old ON old.id=snap.submission_id WHERE old.lab_id=NEW.lab_id)),
 'admission',current.payload FROM current_lab_snapshots current WHERE current.lab_id=NEW.lab_id;
END;
INSERT INTO submission_snapshots(submission_id,origin,payload)
 SELECT s.id,'migration-current-state',c.payload FROM submissions s JOIN current_lab_snapshots c ON c.lab_id=s.lab_id;
CREATE TRIGGER snapshots_immutable_update BEFORE UPDATE ON submission_snapshots BEGIN SELECT RAISE(ABORT,'snapshot is immutable'); END;
CREATE TRIGGER snapshots_immutable_delete BEFORE DELETE ON submission_snapshots BEGIN SELECT RAISE(ABORT,'snapshot is immutable'); END;
CREATE TABLE attempt_safety (
 attempt_id TEXT PRIMARY KEY REFERENCES attempts(id), job_id TEXT NOT NULL REFERENCES jobs(id),
 cleanup TEXT NOT NULL CHECK(cleanup IN ('pending','confirmed','quarantined')),
 retryable INTEGER NOT NULL DEFAULT 0, reason TEXT, metadata TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE TABLE cleanup_audit (
 id INTEGER PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempt_safety(attempt_id),
 operator TEXT NOT NULL, confirmed INTEGER NOT NULL, at INTEGER NOT NULL
) STRICT;
-- Pre-upgrade workers did not record durable cleanup; do not assume their containers vanished.
INSERT INTO attempt_safety(attempt_id,job_id,cleanup,reason)
 SELECT a.id,a.job_id,'quarantined','pre_upgrade_active_attempt' FROM attempts a JOIN jobs j ON j.id=a.job_id
 WHERE j.state='leased' AND a.lease_token=j.lease_token AND a.outcome='active';
CREATE TABLE quota_policies (
 lab_id INTEGER NOT NULL REFERENCES labs(id), provider TEXT NOT NULL,
 max_calls INTEGER NOT NULL, max_tokens INTEGER NOT NULL, max_cost INTEGER NOT NULL,
 rpd INTEGER NOT NULL, rpm INTEGER NOT NULL, tpm INTEGER NOT NULL, concurrency INTEGER NOT NULL, verified_free INTEGER NOT NULL,
 PRIMARY KEY(lab_id,provider)
) STRICT;
CREATE TABLE quota_reservations (
 id TEXT PRIMARY KEY, lab_id INTEGER NOT NULL REFERENCES labs(id), provider TEXT NOT NULL,
 attempt_id TEXT NOT NULL, reserved_tokens INTEGER NOT NULL, reserved_cost INTEGER NOT NULL,
 created_at INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('reserved','uncertain','settled')),
 usage_tokens INTEGER, usage_cost INTEGER, outcome TEXT,
 UNIQUE(provider,attempt_id)
) STRICT;
CREATE INDEX quota_provider_window ON quota_reservations(provider,created_at);
CREATE TABLE trusted_identity_values(user_id TEXT NOT NULL REFERENCES users(id), value TEXT NOT NULL, PRIMARY KEY(user_id,value)) STRICT;
CREATE TABLE attempt_model_calls (
 call_key TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), provider TEXT NOT NULL,
 request_id TEXT, response_id TEXT, model TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER,
 duration_ms INTEGER NOT NULL, outcome TEXT NOT NULL
) STRICT;
