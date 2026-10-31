-- Two distinct foreign keys from one table to the same parent (two roles).
CREATE TABLE airport (
  iata VARCHAR(3) NOT NULL,
  city VARCHAR(60),
  PRIMARY KEY (iata)
);

CREATE TABLE flight (
  flight_no INTEGER NOT NULL,
  origin VARCHAR(3) NOT NULL,
  destination VARCHAR(3) NOT NULL,
  PRIMARY KEY (flight_no),
  FOREIGN KEY (origin) REFERENCES airport (iata),
  FOREIGN KEY (destination) REFERENCES airport (iata)
);
