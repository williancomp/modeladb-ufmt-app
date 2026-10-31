-- Features outside the conceptual model: CHECK, DEFAULT, secondary index, referential actions.
CREATE TABLE account (
  account_id INTEGER NOT NULL,
  owner_name VARCHAR(80) NOT NULL,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  CHECK (balance >= 0),
  PRIMARY KEY (account_id)
);

CREATE TABLE movement (
  movement_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reversed_by INTEGER,
  PRIMARY KEY (movement_id),
  FOREIGN KEY (account_id) REFERENCES account (account_id) ON DELETE RESTRICT,
  FOREIGN KEY (reversed_by) REFERENCES movement (movement_id) ON DELETE SET NULL
);

CREATE INDEX idx_movement_account ON movement (account_id);
