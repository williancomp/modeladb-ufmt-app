-- Column-level UNIQUE, composite UNIQUE and a one-to-one foreign key made unique.
CREATE TABLE person (
  person_id INTEGER NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  first_name VARCHAR(40) NOT NULL,
  last_name VARCHAR(40) NOT NULL,
  PRIMARY KEY (person_id),
  UNIQUE (first_name, last_name)
);

CREATE TABLE passport (
  passport_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL UNIQUE,
  issued DATE,
  PRIMARY KEY (passport_id),
  FOREIGN KEY (person_id) REFERENCES person (person_id)
);
