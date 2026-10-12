-- Enum additions must commit before a subsequent migration uses the new value.
ALTER TYPE clearance_status ADD VALUE IF NOT EXISTS 'rejected';
