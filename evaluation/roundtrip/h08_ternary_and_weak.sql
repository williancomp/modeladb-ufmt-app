-- A three-way join table and a dependent table whose key contains the owner's key.
CREATE TABLE supplier (supplier_id INTEGER NOT NULL, name VARCHAR(60), PRIMARY KEY (supplier_id));
CREATE TABLE part (part_id INTEGER NOT NULL, name VARCHAR(60), PRIMARY KEY (part_id));
CREATE TABLE project (project_id INTEGER NOT NULL, name VARCHAR(60), PRIMARY KEY (project_id));

CREATE TABLE supply (
  supplier_id INTEGER NOT NULL,
  part_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  quantity INTEGER,
  PRIMARY KEY (supplier_id, part_id, project_id),
  FOREIGN KEY (supplier_id) REFERENCES supplier (supplier_id),
  FOREIGN KEY (part_id) REFERENCES part (part_id),
  FOREIGN KEY (project_id) REFERENCES project (project_id)
);

CREATE TABLE purchase_order (order_id INTEGER NOT NULL, placed DATE, PRIMARY KEY (order_id));

CREATE TABLE order_line (
  order_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  quantity INTEGER,
  PRIMARY KEY (order_id, line_no),
  FOREIGN KEY (order_id) REFERENCES purchase_order (order_id)
);
