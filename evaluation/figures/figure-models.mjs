/** Small models for the figures (DSL of evaluation/corpus/build.mjs); few elements, so labels stay large at print size. */
export const libraryModel = {
  id: 'fig_library',
  domain: 'Library loans (figure model)',
  entities: [
    { k: 'publisher', name: 'Publisher', at: [0, 0], attrs: ['publisher_no:Int key', 'publisher_name:Text'] },
    { k: 'book', name: 'Book', at: [1, 0], attrs: ['isbn:Text key', 'title:Text', 'price:Real'] },
    { k: 'author', name: 'Author', at: [1, 1], attrs: ['author_no:Int key', 'full_name:Text'] },
  ],
  rels: [
    { k: 'publishes', name: 'prints', parts: [{ e: 'publisher', card: '0,1' }, { e: 'book', card: '1,N' }] },
    { k: 'writes', name: 'writes', parts: [{ e: 'author', card: '1,N' }, { e: 'book', card: '1,N' }] },
  ],
};

export const universityModel = {
  id: 'fig_university',
  domain: 'University enrolment (figure model)',
  entities: [
    { k: 'department', name: 'Department', at: [0, 0], attrs: ['dept_no:Int key', 'dept_name:Text'] },
    { k: 'course', name: 'Course', at: [1, 0], attrs: ['course_no:Int key', 'title:Text'] },
    { k: 'student', name: 'Student', at: [1, 1], attrs: ['student_no:Int key', 'full_name:Text'] },
  ],
  rels: [
    { k: 'owns', name: 'owns', parts: [{ e: 'department', card: '0,1' }, { e: 'course', card: '1,N' }] },
    { k: 'enrolls_in', name: 'takes', parts: [{ e: 'student', card: '0,N' }, { e: 'course', card: '0,N' }], attrs: ['grade:Real'] },
  ],
};

/**
 * Figure fixture: a small university model with a weak entity (Section, identified through Course), a
 * specialization (Student -> Undergraduate, Graduate), a multivalued attribute (Course.keywords) and, when `seeded`
 * is true, one seeded defect: the dependent connection of the identifying relationship is partial (0,N), which
 * rule R012 reports (a weak entity depends totally on its owner). The repaired model differs only in that connection.
 */
export const eerFigureModel = (seeded) => ({
  id: seeded ? 'fig_eer_university_defect' : 'fig_eer_university_repaired',
  domain: 'University (EER figure fixture)',
  entities: [
    { k: 'department', name: 'Department', at: [0, 0], attrs: ['dept_no:Int key', 'dept_name:Text'] },
    { k: 'course', name: 'Course', at: [1, 0], attrs: ['course_no:Int key', 'title:Text', 'keywords:Text multi'] },
    { k: 'section', name: 'Section', at: [2, 0], attrs: ['section_no:Int partial', 'semester:Text'] },
    { k: 'student', name: 'Student', at: [2, 1.2], attrs: ['student_no:Int key', 'full_name:Text'] },
    { k: 'undergrad', name: 'Undergraduate', at: [1.3, 2.3], attrs: ['major:Text'] },
    { k: 'graduate', name: 'Graduate', at: [2.7, 2.3], attrs: ['thesis:Text'] },
  ],
  specs: [{ k: 's1', genType: 'P,D', sup: 'student', subs: ['undergrad', 'graduate'], at: [2, 1.85] }],
  rels: [
    { k: 'owns', name: 'owns', parts: [{ e: 'department', card: '0,1' }, { e: 'course', card: '1,N' }] },
    { k: 'offered_as', name: 'offered as', parts: [{ e: 'course', card: '0,1' }, { e: 'section', card: seeded ? '0,N' : '1,N', weak: true }] },
    { k: 'enrolls_in', name: 'enrolls in', parts: [{ e: 'student', card: '0,N' }, { e: 'section', card: '0,N' }] },
  ],
});
