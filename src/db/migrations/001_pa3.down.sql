-- Destructive downgrade: back up the database and stop API/workers first.
-- PA2 tables and their rows are retained. Never run this automatically.
DROP TABLE model_call_metadata;
DROP TABLE review_audit;
DROP TABLE reviews;
DROP TABLE verdicts;
DROP TABLE verdict_sets;
DROP TABLE attempts;
DROP TABLE jobs;
DROP TABLE submission_requests;
DROP TABLE counted_heads;
DROP TABLE submissions;
DROP TABLE lab_tests;
DROP TABLE lab_constraints;
DROP TABLE lab_details;
DROP TABLE enrollments;
DROP TABLE classes;
DROP TABLE users;
DELETE FROM schema_migrations WHERE version = 1;
