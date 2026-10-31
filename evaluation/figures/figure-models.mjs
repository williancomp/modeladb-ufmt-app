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
