/**
 * A single model that uses every construct of the notation once (DSL of evaluation/corpus/build.mjs).
 * The layout is fixed by hand (`layout` below, applied by placeConstructSet) in zones that read top to bottom:
 *   union (Payer, U, Person/Sponsor) -> weak entity (Passport, holds, Person) -> specialization (Person, T,D, Student/Teacher)
 *   -> relationships (enrols in, books, recursive supervises) -> aggregation (Funding over books, Sponsor).
 * No connection crosses a label, an entity or a diamond it does not belong to, and no two connections cross.
 */
export const constructSet = {
  id: 'construct_set',
  domain: 'Every construct of the notation',
  entities: [
    { k: 'payer', name: 'Payer', at: [0, 0], attrs: ['payer_no:Int key'] },
    { k: 'person', name: 'Person', at: [0, 0], attrs: ['person_id:Int key', 'full_name:Text', 'phone:Text multi', 'age:Int derived'] },
    { k: 'passport', name: 'Passport', at: [0, 0], attrs: ['seq:Int partial', 'issued:Date'] },
    { k: 'student', name: 'Student', at: [0, 0], attrs: ['enrolment:Int'] },
    { k: 'teacher', name: 'Teacher', at: [0, 0], attrs: ['employee_no:Text key filled'] },
    { k: 'course', name: 'Course', at: [0, 0], attrs: ['code:Text key', 'title:Text'] },
    { k: 'room', name: 'Room', at: [0, 0], attrs: ['room_no:Int key', { name: 'location', comp: ['building:Text', 'floor:Int'] }] },
    { k: 'sponsor', name: 'Sponsor', at: [0, 0], attrs: ['sponsor_no:Int key'] },
  ],
  specs: [
    { k: 's1', genType: 'T,D', sup: 'person', subs: ['student', 'teacher'], at: [0, 0] },
    { k: 'u1', genType: 'U', sup: 'payer', subs: ['person', 'sponsor'], at: [0, 0] },
  ],
  rels: [
    { k: 'holds', name: 'holds', at: [0, 0], parts: [{ e: 'person', card: '1,1' }, { e: 'passport', card: '1,1', weak: true }] },
    { k: 'enrols', name: 'enrols in', at: [0, 0], parts: [{ e: 'student', card: '0,N' }, { e: 'course', card: '1,N' }], attrs: ['grade:Real'] },
    { k: 'supervises', name: 'supervises', at: [0, 0], parts: [{ e: 'teacher', card: '0,1', role: 'supervisor' }, { e: 'teacher', card: '0,N', role: 'supervisee' }] },
    { k: 'schedules', name: 'books', at: [0, 0], parts: [{ e: 'course', card: '1,N' }, { e: 'room', card: '0,N' }, { e: 'teacher', card: '0,N' }] },
  ],
  aggs: [{ k: 'funding', name: 'Funding', at: [0, 0], parts: [{ r: 'schedules' }, { e: 'sponsor' }], attrs: ['amount:Real'] }],
  postits: [{ text: 'Cardinalities are (min,max) of the participant.', at: [0, 0] }],
};

/** Centres (px) of every node; attributes are offsets from the centre of their owner (the circle; its label runs to the right). */
export const layout = {
  entities: { payer: [1000, 100], person: [600, 600], passport: [-80, 600], student: [330, 1140], teacher: [870, 1140], course: [620, 1580], room: [1300, 1560], sponsor: [1500, 600] },
  specs: { s1: [600, 870], u1: [1000, 330] },
  rels: { holds: [260, 600], enrols: [400, 1390], supervises: [1160, 860], schedules: [900, 1390] },
  aggs: { funding: [1500, 1330] },
  postits: { 0: [-200, 1440] },
  attrs: {
    'payer.payer_no': [150, -10],
    'person.person_id': [240, -40], 'person.full_name': [250, 30], 'person.phone': [250, 100], 'person.age': [240, 170],
    'passport.seq': [-20, 110], 'passport.issued': [-20, -110],
    'student.enrolment': [-90, -100],
    'teacher.employee_no': [140, 90],
    'course.code': [-110, 110], 'course.title': [110, 110],
    'room.room_no': [130, -80], 'room.location': [230, 20], 'room.location.building': [70, -90], 'room.location.floor': [70, 90],
    'sponsor.sponsor_no': [150, -60],
    'enrols.grade': [170, -30],
    'funding.amount': [150, 0],
  },
};

/** Applies the hand-made layout to a document built by buildDocument(constructSet). */
export function placeConstructSet(doc) {
  const pos = doc.view.positions;
  const byKey = (list, model) => Object.fromEntries(model.map((m, i) => [m.k, list[i]]));
  const ents = byKey(doc.domain.entities, constructSet.entities);
  const rels = byKey(doc.domain.relationships, constructSet.rels);
  const specs = byKey(doc.domain.specializations, constructSet.specs);
  const aggs = byKey(doc.domain.aggregations, constructSet.aggs);
  const centre = {};
  for (const [k, [x, y]] of Object.entries(layout.entities)) { pos[`entity_${ents[k].id}`] = { ...pos[`entity_${ents[k].id}`], x: x - 80, y: y - 40 }; centre[k] = { x, y }; }
  for (const [k, [x, y]] of Object.entries(layout.rels)) { Object.assign(pos[`rel_${rels[k].id}`], { x, y }); centre[k] = { x, y }; }
  for (const [k, [x, y]] of Object.entries(layout.specs)) Object.assign(pos[`spec_${specs[k].id}`], { x, y });
  for (const [k, [x, y]] of Object.entries(layout.aggs)) { Object.assign(pos[`agg_${aggs[k].id}`], { x, y }); centre[k] = { x, y }; }
  for (const [i, [x, y]] of Object.entries(layout.postits)) Object.assign(pos[`postit_${i}`], { x, y });
  pos[`rel_${rels.supervises.id}`].size = 150; // room for the name on one line
  const owners = { ...ents, ...rels, ...aggs };
  const keyOf = (obj) => Object.keys(owners).find((k) => owners[k] === obj);
  const attrKey = (a) => {
    if (a.parentType === 'attribute') return `${attrKey(doc.domain.attributes[a.parentId])}.${a.name}`;
    const owner = Object.values(owners).find((o) => o.objType === a.parentType && o.id === a.parentId);
    return `${keyOf(owner)}.${a.name}`;
  };
  const absolute = {};
  const resolve = (a) => {
    if (absolute[a.id]) return absolute[a.id];
    const [dx, dy] = layout.attrs[attrKey(a)] || (() => { throw new Error(`no layout for ${attrKey(a)}`); })();
    const base = a.parentType === 'attribute' ? resolve(doc.domain.attributes[a.parentId]) : centre[keyOf(Object.values(owners).find((o) => o.objType === a.parentType && o.id === a.parentId))];
    return (absolute[a.id] = { x: base.x + dx, y: base.y + dy });
  };
  for (const a of doc.domain.attributes) pos[`attr_${a.id}`] = resolve(a);
  return doc;
}
