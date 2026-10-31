-- Recursive (unary) relationship through a nullable self-referencing foreign key.
CREATE TABLE employee (
  employee_id INTEGER NOT NULL,
  full_name VARCHAR(80) NOT NULL,
  manager_id INTEGER,
  PRIMARY KEY (employee_id),
  FOREIGN KEY (manager_id) REFERENCES employee (employee_id)
);
