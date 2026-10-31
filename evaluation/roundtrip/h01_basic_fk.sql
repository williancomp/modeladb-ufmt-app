-- Hand-written, dialect-neutral. Basic parent/child with required and optional foreign keys.
CREATE TABLE publisher (
  publisher_id INTEGER NOT NULL,
  name VARCHAR(80) NOT NULL,
  founded DATE,
  PRIMARY KEY (publisher_id)
);

CREATE TABLE editor (
  editor_id INTEGER NOT NULL,
  full_name VARCHAR(60) NOT NULL,
  PRIMARY KEY (editor_id)
);

CREATE TABLE book (
  book_id INTEGER NOT NULL,
  title VARCHAR(120) NOT NULL,
  price DECIMAL(10,2),
  publisher_id INTEGER NOT NULL,
  editor_id INTEGER,
  PRIMARY KEY (book_id),
  FOREIGN KEY (publisher_id) REFERENCES publisher (publisher_id),
  FOREIGN KEY (editor_id) REFERENCES editor (editor_id)
);
