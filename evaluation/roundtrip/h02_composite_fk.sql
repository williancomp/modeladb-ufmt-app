-- Composite primary key referenced by a composite foreign key.
CREATE TABLE course (
  course_code VARCHAR(10) NOT NULL,
  edition INTEGER NOT NULL,
  title VARCHAR(100),
  PRIMARY KEY (course_code, edition)
);

CREATE TABLE exam (
  exam_id INTEGER NOT NULL,
  course_code VARCHAR(10) NOT NULL,
  edition INTEGER NOT NULL,
  exam_date DATE,
  PRIMARY KEY (exam_id),
  FOREIGN KEY (course_code, edition) REFERENCES course (course_code, edition)
);
