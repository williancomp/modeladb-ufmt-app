/**
 * Hand-written relational oracles, one per corpus model.
 *
 * Provenance: written from the standard ER/EER-to-relational mapping rules BEFORE any DDL was
 * generated for these models and never edited to match tool output. The tool's source was read
 * beforehand for its naming conventions and documented strategy choices (see RULES below), not
 * for output. A mismatch between this file and the tool's output is a result, not a typo.
 *
 * MAPPING RULES (conventional ER/EER-to-relational mapping with the strategy choices the tool documents;
 * no source is attributed here):
 *  M1  Strong entity -> table; simple and composite (flattened, prefix `<attr>_`) attributes -> columns;
 *      key attributes -> PK; other columns nullable; derived attributes are not stored.
 *  M2  Weak entity -> table with its attributes plus an FK to each owner; PK = partial key + owner PK;
 *      the FK columns are NOT NULL. A 1:1 identifying relationship also makes the FK unique.
 *  M3  1:1 -> FK in the table of the participant with total participation, UNIQUE; NOT NULL iff total.
 *  M4  1:N -> FK in the N-side table; NOT NULL iff the N-side participation is total.
 *  M5  N:M -> relationship table with an FK to each participant; PK = all FK columns;
 *      relationship attributes become columns. Max bounds other than 1/N are not enforced by DDL.
 *  M6  N-ary (n>2) -> relationship table, PK = all FK columns.
 *  M7  Multivalued attribute -> table (owner FK + `value`), PK = both.
 *  M8  Specialization. Total+disjoint -> single table: sub attributes merged (nullable) plus a NOT NULL
 *      discriminator column. Otherwise one table per subtype whose PK is an FK to the supertype.
 *  M9  Category (union) -> table with a surrogate key; each member keeps its own PK and gets a nullable,
 *      UNIQUE FK to the category.
 *  M10 Aggregation -> table with an FK to each aggregated element; PK = all FK columns; own attributes.
 *  M11 Distinct relationships between the same participants yield distinct FKs.
 *  M12 Identifiers are lower-case ASCII snake_case: accents are transliterated, not replaced.
 *  Naming conventions of the tool used here: relationship tables `rel_<relationship>`, aggregation
 *  tables `agg_<name>`, multivalued tables `<owner>_<attribute>`.
 *
 * COLUMN SPEC: 'kind' with optional '!' for NOT NULL. Kinds: text int real date ts bool uuid.
 * FK SPEC: { to, nullable (default true), unique (default false), role (substring of FK column names) }.
 * PK entries: column name | 'fk:<table>' (all columns of that FK) | 'surrogate'.
 * `extra`: 'surrogate' (one unnamed integer PK column) | 'discriminator' (one unnamed NOT NULL text column).
 */
export const oracles = {
  m01_library: {
    publisher: { columns: { publisher_no: 'int!', publisher_name: 'text', country: 'text' }, pk: ['publisher_no'] },
    book: { columns: { isbn: 'text!', title: 'text', pages: 'int', price: 'real', published: 'date' }, pk: ['isbn'], fks: [{ to: 'publisher', nullable: false }] },
    author: { columns: { author_no: 'int!', full_name: 'text', birth_date: 'date' }, pk: ['author_no'] },
    member: { columns: { member_no: 'int!', email: 'text', address_street: 'text', address_city: 'text', address_zip: 'text' }, pk: ['member_no'] },
    rel_writes: { columns: {}, pk: ['fk:author', 'fk:book'], fks: [{ to: 'author', nullable: false }, { to: 'book', nullable: false }] },
    rel_borrows: { columns: { loan_date: 'date', due_date: 'date', returned: 'bool' }, pk: ['fk:member', 'fk:book'], fks: [{ to: 'member', nullable: false }, { to: 'book', nullable: false }] },
  },
  m02_university: {
    department: { columns: { dept_no: 'int!', dept_name: 'text' }, pk: ['dept_no'] },
    course: { columns: { course_no: 'int!', title: 'text', credits: 'int' }, pk: ['course_no'], fks: [{ to: 'department', nullable: false }] },
    section: { columns: { section_no: 'int!', semester: 'text' }, pk: ['section_no', 'fk:course'], fks: [{ to: 'course', nullable: false }] },
    student: { columns: { student_no: 'int!', full_name: 'text', birth_date: 'date' }, pk: ['student_no'] },
    rel_enrolls_in: { columns: { grade: 'real' }, pk: ['fk:student', 'fk:section'], fks: [{ to: 'student', nullable: false }, { to: 'section', nullable: false }] },
  },
  m03_hospital: {
    staff: { columns: { staff_no: 'int!', full_name: 'text', hired: 'date' }, pk: ['staff_no'] },
    doctor: { columns: { license_no: 'text' }, pk: ['fk:staff'], fks: [{ to: 'staff', nullable: false }] },
    nurse: { columns: { ward: 'text' }, pk: ['fk:staff'], fks: [{ to: 'staff', nullable: false }] },
    patient: { columns: { patient_no: 'int!', full_name: 'text' }, pk: ['patient_no'], fks: [{ to: 'room' }] },
    patient_phones: { columns: { value: 'text!' }, pk: ['fk:patient', 'value'], fks: [{ to: 'patient', nullable: false }] },
    diagnosis: { columns: { diagnosis_no: 'int!', label: 'text' }, pk: ['diagnosis_no'] },
    room: { columns: { room_no: 'int!', floor: 'int' }, pk: ['room_no'] },
    rel_treats: { columns: { treated_on: 'date' }, pk: ['fk:doctor', 'fk:patient', 'fk:diagnosis'], fks: [{ to: 'doctor', nullable: false }, { to: 'patient', nullable: false }, { to: 'diagnosis', nullable: false }] },
  },
  m04_airline: {
    airport: { columns: { iata: 'text!', city: 'text' }, pk: ['iata'] },
    flight: { columns: { flight_no: 'text!', flight_date: 'date!', gate: 'text' }, pk: ['flight_no', 'flight_date'], fks: [{ to: 'airport', nullable: false, role: 'origin' }, { to: 'airport', nullable: false, role: 'destination' }] },
    pilot: { columns: { pilot_no: 'int!', full_name: 'text' }, pk: ['pilot_no'] },
    passport: { columns: { passport_no: 'text!', expires: 'date' }, pk: ['passport_no'], fks: [{ to: 'pilot', nullable: false, unique: true }] },
    aircraft: { columns: { tail_no: 'text!', model: 'text' }, pk: ['tail_no'] },
    seat: { columns: { seat_label: 'text!', cabin: 'text' }, pk: ['seat_label', 'fk:aircraft'], fks: [{ to: 'aircraft', nullable: false }] },
    rel_crews: { columns: {}, pk: ['fk:flight', 'fk:pilot'], fks: [{ to: 'flight', nullable: false }, { to: 'pilot', nullable: false }] },
  },
  m05_ecommerce: {
    customer: { columns: { customer_no: 'int!', email: 'text', registered: 'ts' }, pk: ['customer_no'] },
    order: { columns: { order_no: 'int!', placed_at: 'ts' }, pk: ['order_no'], fks: [{ to: 'customer', nullable: false }] },
    order_line: { columns: { line_no: 'int!', quantity: 'int' }, pk: ['line_no', 'fk:order'], fks: [{ to: 'order', nullable: false }, { to: 'product', nullable: false }] },
    product: { columns: { sku: 'text!', product_title: 'text', unit_price: 'real' }, pk: ['sku'], fks: [{ to: 'category' }] },
    category: { columns: { category_no: 'int!', label: 'text' }, pk: ['category_no'], fks: [{ to: 'category', role: 'parent' }] },
    payment: { columns: { payment_no: 'int!', amount: 'real', paid_at: 'ts', card_last4: 'text', drawer: 'text' }, pk: ['payment_no'], extra: 'discriminator', fks: [{ to: 'order' }] },
  },
  m06_car_rental: {
    vehicle: { columns: { plate: 'text!', brand: 'text', model_year: 'int' }, pk: ['plate'], fks: [{ to: 'branch', nullable: false }] },
    car: { columns: { doors: 'int' }, pk: ['fk:vehicle'], fks: [{ to: 'vehicle', nullable: false }] },
    truck: { columns: { payload: 'real' }, pk: ['fk:vehicle'], fks: [{ to: 'vehicle', nullable: false }] },
    customer: { columns: { license_no: 'text!', full_name: 'text' }, pk: ['license_no'] },
    individual: { columns: { birth_date: 'date' }, pk: ['fk:customer'], fks: [{ to: 'customer', nullable: false }] },
    company: { columns: { vat_no: 'text' }, pk: ['fk:customer'], fks: [{ to: 'customer', nullable: false }] },
    branch: { columns: { branch_no: 'int!', city: 'text' }, pk: ['branch_no'] },
    rel_rents: { columns: { start_date: 'date', end_date: 'date', daily_rate: 'real' }, pk: ['fk:customer', 'fk:vehicle'], fks: [{ to: 'customer', nullable: false }, { to: 'vehicle', nullable: false }] },
  },
  m07_music: {
    artist: { columns: { artist_no: 'int!', stage_name: 'text' }, pk: ['artist_no'] },
    artist_genres: { columns: { value: 'text!' }, pk: ['fk:artist', 'value'], fks: [{ to: 'artist', nullable: false }] },
    album: { columns: { album_no: 'int!', album_title: 'text', released: 'date' }, pk: ['album_no'], fks: [{ to: 'artist', nullable: false }] },
    track: { columns: { track_no: 'int!', track_title: 'text', seconds: 'int' }, pk: ['track_no', 'fk:album'], fks: [{ to: 'album', nullable: false }] },
    playlist: { columns: { playlist_no: 'int!', label: 'text' }, pk: ['playlist_no'] },
    rel_includes: { columns: { position: 'int' }, pk: ['fk:playlist', 'fk:track'], fks: [{ to: 'playlist', nullable: false }, { to: 'track', nullable: false }] },
  },
  m08_timetable: {
    teacher: { columns: { teacher_no: 'int!', full_name: 'text' }, pk: ['teacher_no'], fks: [{ to: 'teacher', role: 'mentor' }] },
    room: { columns: { room_no: 'int!', capacity: 'int' }, pk: ['room_no'] },
    slot: { columns: { slot_no: 'int!', weekday: 'text', starts: 'text' }, pk: ['slot_no'] },
    department: { columns: { department_no: 'int!', title: 'text' }, pk: ['department_no'], fks: [{ to: 'teacher', nullable: false, unique: true }] },
    rel_schedules: { columns: { subject_title: 'text' }, pk: ['fk:teacher', 'fk:room', 'fk:slot'], fks: [{ to: 'teacher', nullable: false }, { to: 'room', nullable: false }, { to: 'slot', nullable: false }] },
  },
  m09_projects: {
    department: { columns: { dept_no: 'int!', dept_name: 'text' }, pk: ['dept_no'] },
    employee: { columns: { emp_no: 'int!', full_name: 'text', address_street: 'text', address_city: 'text' }, pk: ['emp_no'], fks: [{ to: 'department', nullable: false }, { to: 'employee', role: 'supervisor' }] },
    project: { columns: { project_no: 'int!', project_title: 'text' }, pk: ['project_no'] },
    sponsor: { columns: { sponsor_no: 'int!', sponsor_name: 'text' }, pk: ['sponsor_no'] },
    rel_works_on: { columns: { hours: 'real' }, pk: ['fk:employee', 'fk:project'], fks: [{ to: 'employee', nullable: false }, { to: 'project', nullable: false }] },
    agg_sponsorship: { columns: { budget: 'real' }, pk: ['fk:rel_works_on', 'fk:sponsor'], fks: [{ to: 'rel_works_on', nullable: false }, { to: 'sponsor', nullable: false }] },
  },
  m10_hotel: {
    floor: { columns: { floor_no: 'int!', label: 'text' }, pk: ['floor_no'] },
    room: { columns: { room_no: 'int!', beds: 'int' }, pk: ['room_no'], fks: [{ to: 'floor', nullable: false }] },
    suite: { columns: { has_jacuzzi: 'bool' }, pk: ['fk:room'], fks: [{ to: 'room', nullable: false }] },
    accessible_room: { columns: { ramp_width: 'real' }, pk: ['fk:room'], fks: [{ to: 'room', nullable: false }] },
    guest: { columns: { guest_no: 'int!', full_name: 'text', email: 'text' }, pk: ['guest_no'] },
    rel_books: { columns: { check_in: 'date', check_out: 'date', booked_at: 'ts' }, pk: ['fk:guest', 'fk:room'], fks: [{ to: 'guest', nullable: false }, { to: 'room', nullable: false }] },
  },
  m11_registry: {
    owner: { columns: { owner_since: 'date' }, pk: ['surrogate'], extra: 'surrogate' },
    person: { columns: { cpf: 'text!', full_name: 'text' }, pk: ['cpf'], fks: [{ to: 'owner', unique: true }] },
    company: { columns: { cnpj: 'text!', legal_name: 'text' }, pk: ['cnpj'], fks: [{ to: 'owner', unique: true }] },
    vehicle: { columns: { plate: 'text!', color: 'text' }, pk: ['plate'], fks: [{ to: 'owner', nullable: false }] },
  },
  m12_league: {
    team: { columns: { team_code: 'text!', team_name: 'text' }, pk: ['team_code'] },
    player: { columns: { player_no: 'int!', full_name: 'text', shirt: 'int' }, pk: ['player_no'], fks: [{ to: 'team' }] },
    fixture: { columns: { season: 'int!', round: 'int!', venue: 'text' }, pk: ['season', 'round'], fks: [{ to: 'team', nullable: false }, { to: 'team', nullable: false }] },
    rel_scores: { columns: { goals: 'int' }, pk: ['fk:player', 'fk:fixture'], fks: [{ to: 'player', nullable: false }, { to: 'fixture', nullable: false }] },
  },
  m13_academico: {
    aluno: { columns: { matricula: 'int!', nome_completo: 'text', data_nascimento: 'date' }, pk: ['matricula'] },
    disciplina: { columns: { codigo_disciplina: 'text!', carga_horaria: 'int' }, pk: ['codigo_disciplina'], fks: [{ to: 'professor', nullable: false }] },
    professor: { columns: { siape: 'int!', nome: 'text' }, pk: ['siape'] },
    rel_cursa: { columns: { nota: 'real' }, pk: ['fk:aluno', 'fk:disciplina'], fks: [{ to: 'aluno', nullable: false }, { to: 'disciplina', nullable: false }] },
  },
  m14_identity: {
    citizen: {
      columns: { citizen_uuid: 'uuid!', birth: 'date', verified: 'bool', last_login: 'ts', balance: 'real', full_name: 'text', contact_phone: 'text', contact_address_street: 'text', contact_address_number: 'int' },
      pk: ['citizen_uuid'],
    },
    passport: { columns: { passport_seq: 'int!', issued: 'date' }, pk: ['passport_seq', 'fk:citizen'], fks: [{ to: 'citizen', nullable: false, unique: true }] },
  },
};

/** Expected declared type per kind, per dialect, from the DBMS documentation (not from output). */
export const KIND_TYPES = {
  postgres: { text: ['character varying'], int: ['integer'], real: ['numeric'], date: ['date'], ts: ['timestamp without time zone'], bool: ['boolean'], uuid: ['uuid'] },
  mysql: { text: ['varchar'], int: ['int'], real: ['decimal'], date: ['date'], ts: ['datetime'], bool: ['tinyint'], uuid: ['char'] },
  mariadb: { text: ['varchar'], int: ['int'], real: ['decimal'], date: ['date'], ts: ['datetime'], bool: ['tinyint'], uuid: ['char'] },
  // SQLite keeps the declared type name; booleans are integers and UUID/time are text by the tool's documented mapping.
  sqlite: { text: ['VARCHAR', 'TEXT'], int: ['INTEGER'], real: ['DECIMAL', 'NUMERIC', 'REAL'], date: ['DATE', 'TEXT'], ts: ['TEXT', 'DATETIME'], bool: ['INTEGER', 'BOOLEAN'], uuid: ['TEXT', 'CHAR'] },
};
