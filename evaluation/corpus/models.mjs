/**
 * Corpus authoring source: fourteen original ER/EER models in common teaching domains.
 *
 * Cardinality convention of the tool (see docs/NOTATION.md): the max next to a participant is
 * Chen's ratio label (how many instances of that participant relate to one instance of the other
 * side); the min is that participant's participation constraint (1 or more = total).
 *
 * Attribute shorthand: 'name:Type flags' with Type in Text|Int|Real|Date|DateTime|Bool|Uuid and
 * flags key|partial|derived|multi|filled; composite: { name, comp: [shorthand...] }.
 * `build.mjs` turns each entry into a .merdb file; the files are what the evaluation reads.
 */
export const models = [
  {
    id: 'm01_library', domain: 'Library loans',
    entities: [
      { k: 'publisher', name: 'Publisher', at: [0, 0], attrs: ['publisher_no:Int key', 'publisher_name:Text', 'country:Text'] },
      { k: 'book', name: 'Book', at: [1, 0], attrs: ['isbn:Text key', 'title:Text', 'pages:Int', 'price:Real', 'published:Date'] },
      { k: 'author', name: 'Author', at: [2, 0], attrs: ['author_no:Int key', 'full_name:Text', 'birth_date:Date'] },
      { k: 'member', name: 'Member', at: [1, 1], attrs: ['member_no:Int key', 'email:Text', { name: 'address', comp: ['street:Text', 'city:Text', 'zip:Text'] }] },
    ],
    rels: [
      { k: 'publishes', name: 'publishes', parts: [{ e: 'publisher', card: '0,1' }, { e: 'book', card: '1,N' }] },
      { k: 'writes', name: 'writes', parts: [{ e: 'author', card: '1,N' }, { e: 'book', card: '1,N' }] },
      { k: 'borrows', name: 'borrows', parts: [{ e: 'member', card: '0,N' }, { e: 'book', card: '0,N' }], attrs: ['loan_date:Date', 'due_date:Date', 'returned:Bool'] },
    ],
  },
  {
    id: 'm02_university', domain: 'University courses and sections',
    entities: [
      { k: 'department', name: 'Department', at: [0, 0], attrs: ['dept_no:Int key', 'dept_name:Text'] },
      { k: 'course', name: 'Course', at: [1, 0], attrs: ['course_no:Int key', 'title:Text', 'credits:Int'] },
      { k: 'section', name: 'Section', at: [2, 0], attrs: ['section_no:Int partial', 'semester:Text', 'seats_left:Int derived'] },
      { k: 'student', name: 'Student', at: [2, 1], attrs: ['student_no:Int key', 'full_name:Text', 'birth_date:Date', 'age:Int derived'] },
    ],
    rels: [
      { k: 'owns', name: 'owns', parts: [{ e: 'department', card: '0,1' }, { e: 'course', card: '1,N' }] },
      { k: 'offered_as', name: 'offered as', parts: [{ e: 'course', card: '0,1' }, { e: 'section', card: '1,N', weak: true }] },
      { k: 'enrolls_in', name: 'enrolls in', parts: [{ e: 'student', card: '0,N' }, { e: 'section', card: '0,N' }], attrs: ['grade:Real'] },
    ],
  },
  {
    id: 'm03_hospital', domain: 'Hospital care',
    entities: [
      { k: 'staff', name: 'Staff', at: [0, 0], attrs: ['staff_no:Int key', 'full_name:Text', 'hired:Date'] },
      { k: 'doctor', name: 'Doctor', at: [0, 1], attrs: ['license_no:Text'] },
      { k: 'nurse', name: 'Nurse', at: [1, 1], attrs: ['ward:Text'] },
      { k: 'patient', name: 'Patient', at: [2, 0], attrs: ['patient_no:Int key', 'full_name:Text', 'phones:Text multi'] },
      { k: 'diagnosis', name: 'Diagnosis', at: [3, 1], attrs: ['diagnosis_no:Int key', 'label:Text'] },
      { k: 'room', name: 'Room', at: [3, 0], attrs: ['room_no:Int key', 'floor:Int'] },
    ],
    specs: [{ k: 's1', genType: 'P,D', sup: 'staff', subs: ['doctor', 'nurse'], at: [0.5, 0.55] }],
    rels: [
      { k: 'treats', name: 'treats', at: [2, 1], parts: [{ e: 'doctor', card: '0,N' }, { e: 'patient', card: '0,N' }, { e: 'diagnosis', card: '0,N' }], attrs: ['treated_on:Date'] },
      { k: 'occupies', name: 'occupies', parts: [{ e: 'room', card: '0,1' }, { e: 'patient', card: '0,N' }] },
    ],
  },
  {
    id: 'm04_airline', domain: 'Airline operations',
    entities: [
      { k: 'airport', name: 'Airport', at: [0, 0], attrs: ['iata:Text key', 'city:Text'] },
      { k: 'flight', name: 'Flight', at: [1, 0], attrs: ['flight_no:Text key', 'flight_date:Date key', 'gate:Text'] },
      { k: 'pilot', name: 'Pilot', at: [2, 0], attrs: ['pilot_no:Int key', 'full_name:Text'] },
      { k: 'passport', name: 'Passport', at: [3, 0], attrs: ['passport_no:Text key', 'expires:Date'] },
      { k: 'aircraft', name: 'Aircraft', at: [1, 1], attrs: ['tail_no:Text key', 'model:Text'] },
      { k: 'seat', name: 'Seat', at: [2, 1], attrs: ['seat_label:Text partial', 'cabin:Text'] },
    ],
    rels: [
      { k: 'departs_from', name: 'departs from', at: [0.5, 0.5], parts: [{ e: 'airport', card: '0,1', role: 'origin' }, { e: 'flight', card: '1,N' }] },
      { k: 'arrives_at', name: 'arrives at', at: [0.5, -0.45], parts: [{ e: 'airport', card: '0,1', role: 'destination' }, { e: 'flight', card: '1,N' }] },
      { k: 'crews', name: 'crews', parts: [{ e: 'flight', card: '0,N' }, { e: 'pilot', card: '2,5' }] },
      { k: 'holds', name: 'holds', parts: [{ e: 'pilot', card: '0,1' }, { e: 'passport', card: '1,1' }] },
      { k: 'installed_in', name: 'installed in', parts: [{ e: 'aircraft', card: '0,1' }, { e: 'seat', card: '1,N', weak: true }] },
    ],
  },
  {
    id: 'm05_ecommerce', domain: 'Online shop',
    entities: [
      { k: 'customer', name: 'Customer', at: [0, 0], attrs: ['customer_no:Int key', 'email:Text', 'registered:DateTime'] },
      { k: 'order', name: 'Order', at: [1, 0], attrs: ['order_no:Int key', 'placed_at:DateTime', 'total:Real derived'] },
      { k: 'line', name: 'Order Line', at: [2, 0], attrs: ['line_no:Int partial', 'quantity:Int'] },
      { k: 'product', name: 'Product', at: [3, 0], attrs: ['sku:Text key', 'product_title:Text', 'unit_price:Real'] },
      { k: 'category', name: 'Category', at: [3, 1], attrs: ['category_no:Int key', 'label:Text'] },
      { k: 'payment', name: 'Payment', at: [1, 1], attrs: ['payment_no:Int key', 'amount:Real', 'paid_at:DateTime'] },
      { k: 'card', name: 'Card Payment', at: [0, 2], attrs: ['card_last4:Text'] },
      { k: 'cash', name: 'Cash Payment', at: [2, 2], attrs: ['drawer:Text'] },
    ],
    specs: [{ k: 's1', genType: 'T,D', sup: 'payment', subs: ['card', 'cash'], at: [1, 1.7] }],
    rels: [
      { k: 'places', name: 'places', parts: [{ e: 'customer', card: '0,1' }, { e: 'order', card: '1,N' }] },
      { k: 'contains', name: 'contains', parts: [{ e: 'order', card: '0,1' }, { e: 'line', card: '1,N', weak: true }] },
      { k: 'refers_to', name: 'refers to', parts: [{ e: 'product', card: '0,1' }, { e: 'line', card: '1,N' }], at: [2.5, 0.5] },
      { k: 'classified_in', name: 'classified in', parts: [{ e: 'category', card: '0,1' }, { e: 'product', card: '0,N' }] },
      { k: 'parent_of', name: 'parent of', at: [4, 1], parts: [{ e: 'category', card: '0,1', role: 'parent' }, { e: 'category', card: '0,N', role: 'child' }] },
      { k: 'settles', name: 'settles', parts: [{ e: 'order', card: '0,1' }, { e: 'payment', card: '0,N' }] },
    ],
  },
  {
    id: 'm06_car_rental', domain: 'Car rental',
    entities: [
      { k: 'vehicle', name: 'Vehicle', at: [1, 0], attrs: ['plate:Text key', 'brand:Text', 'model_year:Int'] },
      { k: 'car', name: 'Car', at: [0, 1], attrs: ['doors:Int'] },
      { k: 'truck', name: 'Truck', at: [2, 1], attrs: ['payload:Real'] },
      { k: 'customer', name: 'Customer', at: [3, 0], attrs: ['license_no:Text key filled', 'full_name:Text'] },
      { k: 'individual', name: 'Individual', at: [3, 2], attrs: ['birth_date:Date'] },
      { k: 'company', name: 'Company', at: [4, 2], attrs: ['vat_no:Text'] },
      { k: 'branch', name: 'Branch', at: [0, 0], attrs: ['branch_no:Int key', 'city:Text'] },
    ],
    specs: [
      { k: 's1', genType: 'T,C', sup: 'vehicle', subs: ['car', 'truck'], at: [1, 0.75] },
      { k: 's2', genType: 'P,C', sup: 'customer', subs: ['individual', 'company'], at: [3.5, 1.2] },
    ],
    rels: [
      { k: 'stationed_at', name: 'stationed at', parts: [{ e: 'branch', card: '0,1' }, { e: 'vehicle', card: '1,N' }] },
      { k: 'rents', name: 'rents', parts: [{ e: 'customer', card: '0,N' }, { e: 'vehicle', card: '0,N' }], attrs: ['start_date:Date', 'end_date:Date', 'daily_rate:Real'] },
    ],
  },
  {
    id: 'm07_music', domain: 'Music catalogue',
    entities: [
      { k: 'artist', name: 'Artist', at: [0, 0], attrs: ['artist_no:Int key', 'stage_name:Text', 'genres:Text multi'] },
      { k: 'album', name: 'Album', at: [1, 0], attrs: ['album_no:Int key', 'album_title:Text', 'released:Date'] },
      { k: 'track', name: 'Track', at: [2, 0], attrs: ['track_no:Int partial', 'track_title:Text', 'seconds:Int', 'runtime:Text derived'] },
      { k: 'playlist', name: 'Playlist', at: [2, 1], attrs: ['playlist_no:Int key', 'label:Text'] },
    ],
    rels: [
      { k: 'releases', name: 'releases', parts: [{ e: 'artist', card: '0,1' }, { e: 'album', card: '1,N' }] },
      { k: 'has_track', name: 'has track', parts: [{ e: 'album', card: '0,1' }, { e: 'track', card: '1,N', weak: true }] },
      { k: 'includes', name: 'includes', parts: [{ e: 'playlist', card: '0,N' }, { e: 'track', card: '0,N' }], attrs: ['position:Int'] },
    ],
  },
  {
    id: 'm08_timetable', domain: 'School timetable',
    entities: [
      { k: 'teacher', name: 'Teacher', at: [0, 0], attrs: ['teacher_no:Int key', 'full_name:Text'] },
      { k: 'room', name: 'Room', at: [1, 1], attrs: ['room_no:Int key', 'capacity:Int'] },
      { k: 'slot', name: 'Slot', at: [2, 0], attrs: ['slot_no:Int key', 'weekday:Text', 'starts:Text'] },
      { k: 'department', name: 'Department', at: [0, 1.6], attrs: ['department_no:Int key', 'title:Text'] },
    ],
    rels: [
      { k: 'mentors', name: 'mentors', at: [-0.8, 0], parts: [{ e: 'teacher', card: '0,1', role: 'mentor' }, { e: 'teacher', card: '0,N', role: 'mentee' }] },
      { k: 'heads', name: 'heads', parts: [{ e: 'teacher', card: '0,1' }, { e: 'department', card: '1,1' }] },
      { k: 'schedules', name: 'schedules', at: [1, 0.35], parts: [{ e: 'teacher', card: '0,N' }, { e: 'room', card: '0,N' }, { e: 'slot', card: '0,N' }], attrs: ['subject_title:Text'] },
    ],
  },
  {
    id: 'm09_projects', domain: 'Project management',
    entities: [
      { k: 'department', name: 'Department', at: [0, 0], attrs: ['dept_no:Int key', 'dept_name:Text'] },
      { k: 'employee', name: 'Employee', at: [1, 0], attrs: ['emp_no:Int key', 'full_name:Text', { name: 'address', comp: ['street:Text', 'city:Text'] }] },
      { k: 'project', name: 'Project', at: [2, 0], attrs: ['project_no:Int key', 'project_title:Text'] },
      { k: 'sponsor', name: 'Sponsor', at: [3, 1], attrs: ['sponsor_no:Int key', 'sponsor_name:Text'] },
    ],
    rels: [
      { k: 'works_for', name: 'works for', parts: [{ e: 'department', card: '0,1' }, { e: 'employee', card: '1,N' }] },
      { k: 'supervises', name: 'supervises', at: [1, -0.7], parts: [{ e: 'employee', card: '0,1', role: 'supervisor' }, { e: 'employee', card: '0,N', role: 'subordinate' }] },
      { k: 'works_on', name: 'works on', parts: [{ e: 'employee', card: '0,N' }, { e: 'project', card: '1,N' }], attrs: ['hours:Real'] },
    ],
    aggs: [{ k: 'sponsorship', name: 'Sponsorship', at: [2.2, 1.3], parts: [{ r: 'works_on' }, { e: 'sponsor' }], attrs: ['budget:Real'] }],
  },
  {
    id: 'm10_hotel', domain: 'Hotel reservations',
    entities: [
      { k: 'floor', name: 'Floor', at: [0, 0], attrs: ['floor_no:Int key', 'label:Text'] },
      { k: 'room', name: 'Room', at: [1, 0], attrs: ['room_no:Int key', 'beds:Int'] },
      { k: 'suite', name: 'Suite', at: [0.6, 1.5], attrs: ['has_jacuzzi:Bool'] },
      { k: 'accessible', name: 'Accessible Room', at: [1.8, 1.5], attrs: ['ramp_width:Real'] },
      { k: 'guest', name: 'Guest', at: [3, 0], attrs: ['guest_no:Int key', 'full_name:Text', 'email:Text'] },
    ],
    specs: [{ k: 's1', genType: 'P,C', sup: 'room', subs: ['suite', 'accessible'], at: [1.2, 0.95] }],
    rels: [
      { k: 'contains', name: 'contains', parts: [{ e: 'floor', card: '0,1' }, { e: 'room', card: '1,N' }] },
      { k: 'books', name: 'books', at: [2, 0], parts: [{ e: 'guest', card: '0,N' }, { e: 'room', card: '1,4' }], attrs: ['check_in:Date', 'check_out:Date', 'nights:Int derived', 'booked_at:DateTime'] },
    ],
    postits: [{ text: 'Overbooking policy still to be decided with the front desk.', at: [3, 1.6] }],
  },
  {
    id: 'm11_registry', domain: 'Vehicle registry with owner category',
    entities: [
      { k: 'person', name: 'Person', at: [0, 1], attrs: ['cpf:Text key', 'full_name:Text'] },
      { k: 'company', name: 'Company', at: [2, 1], attrs: ['cnpj:Text key', 'legal_name:Text'] },
      { k: 'owner', name: 'Owner', at: [1, 0], attrs: ['owner_since:Date'] },
      { k: 'vehicle', name: 'Vehicle', at: [3, 0], attrs: ['plate:Text key', 'color:Text'] },
    ],
    specs: [{ k: 'u1', genType: 'U', sup: 'owner', subs: ['person', 'company'], at: [1, 0.75] }],
    rels: [{ k: 'owned_by', name: 'owned by', parts: [{ e: 'owner', card: '0,1' }, { e: 'vehicle', card: '1,N' }] }],
  },
  {
    id: 'm12_league', domain: 'Sports league',
    entities: [
      { k: 'team', name: 'Team', at: [0, 0], attrs: ['team_code:Text key', 'team_name:Text'] },
      { k: 'player', name: 'Player', at: [0, 1.4], attrs: ['player_no:Int key', 'full_name:Text', 'shirt:Int'] },
      { k: 'fixture', name: 'Fixture', at: [2, 0], attrs: ['season:Int key', 'round:Int key', 'venue:Text'] },
    ],
    rels: [
      { k: 'plays_for', name: 'plays for', parts: [{ e: 'team', card: '0,1' }, { e: 'player', card: '0,N' }] },
      { k: 'hosts', name: 'hosts', at: [1, -0.5], parts: [{ e: 'team', card: '0,1' }, { e: 'fixture', card: '1,N' }] },
      { k: 'visits', name: 'visits', at: [1, 0.45], parts: [{ e: 'team', card: '0,1' }, { e: 'fixture', card: '1,N' }] },
      { k: 'scores', name: 'scores', parts: [{ e: 'player', card: '0,N' }, { e: 'fixture', card: '0,N' }], attrs: ['goals:Int'] },
    ],
  },
  {
    id: 'm13_academico', domain: 'Registro acadêmico (nomes em português)',
    entities: [
      { k: 'aluno', name: 'Aluno', at: [0, 0], attrs: ['matrícula:Int key', 'nome_completo:Text', 'data_nascimento:Date'] },
      { k: 'disciplina', name: 'Disciplina', at: [1, 0], attrs: ['código_disciplina:Text key', 'carga_horária:Int'] },
      { k: 'professor', name: 'Professor', at: [2, 0], attrs: ['siape:Int key', 'nome:Text'] },
    ],
    rels: [
      { k: 'cursa', name: 'cursa', parts: [{ e: 'aluno', card: '0,N' }, { e: 'disciplina', card: '0,N' }], attrs: ['nota:Real'] },
      { k: 'ministra', name: 'ministra', parts: [{ e: 'professor', card: '0,1' }, { e: 'disciplina', card: '1,N' }] },
    ],
  },
  {
    id: 'm14_identity', domain: 'Identity documents and data types',
    entities: [
      {
        k: 'citizen', name: 'Citizen', at: [0, 0],
        attrs: ['citizen_uuid:Uuid key filled', 'birth:Date', 'verified:Bool', 'last_login:DateTime', 'balance:Real', 'full_name:Text',
          { name: 'contact', comp: ['phone:Text', { name: 'address', comp: ['street:Text', 'number:Int'] }] }],
      },
      { k: 'passport', name: 'Passport', at: [2, 0], attrs: ['passport_seq:Int partial', 'issued:Date'] },
    ],
    rels: [{ k: 'owns_passport', name: 'owns passport', parts: [{ e: 'citizen', card: '0,1' }, { e: 'passport', card: '1,1', weak: true }] }],
  },
];
