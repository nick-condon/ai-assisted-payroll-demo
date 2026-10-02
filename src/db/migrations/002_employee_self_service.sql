-- Fictional demo only. Links a sign-in to one employee record.
-- Ownership is this foreign key, not an email comparison and not a browser-supplied id.

ALTER TABLE users
  ADD COLUMN employee_id UUID UNIQUE REFERENCES employees(id) ON DELETE SET NULL;

INSERT INTO roles (code, name)
VALUES ('employee', 'Employee')
ON CONFLICT (code) DO NOTHING;
