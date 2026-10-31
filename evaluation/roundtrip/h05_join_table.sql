-- Many-to-many resolved by a join table with its own attribute.
CREATE TABLE student (
  student_id INTEGER NOT NULL,
  full_name VARCHAR(80) NOT NULL,
  PRIMARY KEY (student_id)
);

CREATE TABLE subject (
  subject_id INTEGER NOT NULL,
  title VARCHAR(80) NOT NULL,
  PRIMARY KEY (subject_id)
);

CREATE TABLE enrollment (
  student_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  grade DECIMAL(10,2),
  PRIMARY KEY (student_id, subject_id),
  FOREIGN KEY (student_id) REFERENCES student (student_id),
  FOREIGN KEY (subject_id) REFERENCES subject (subject_id)
);
