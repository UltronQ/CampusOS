/** Database constraints, triggers and RLS are authoritative for all writes. */
export function createRecruitmentService(client) {
  async function row(query) {
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data;
  }
  async function rows(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }
  function fields(input, allowed) {
    const unknown = Object.keys(input).filter(key => !allowed.includes(key));
    if (unknown.length) throw new TypeError(`Unsupported fields: ${unknown.join(', ')}`);
    if (!Object.keys(input).length) throw new TypeError('Empty update');
    return input;
  }
  function update(table, id, input, allowed) {
    return row(client.from(table).update(fields(input, allowed)).eq('id', id));
  }
  async function remove(table, id) {
    // A missing/RLS-hidden row fails single(); dependencies fail with SQLSTATE 23503.
    return row(client.from(table).delete().eq('id', id));
  }
  const driveFields = ['company_id', 'title', 'start_date', 'status', 'department_ids',
    'graduation_years', 'minimum_cgpa', 'maximum_backlogs'];
  return {
    listCompanies: () => rows(client.from('companies').select('*').order('name')),
    createCompany: name => row(client.from('companies').insert({ name })),
    updateCompany: (id, name) => update('companies', id, { name }, ['name']),
    deleteCompany: id => remove('companies', id),
    listDrives: () => rows(client.from('drives').select('*, companies(*)').order('start_date', { ascending: false })),
    createDrive: drive => row(client.from('drives').insert(fields(drive, driveFields))),
    updateDrive: (id, changes) => update('drives', id, changes, driveFields.filter(f => f !== 'company_id')),
    updateDriveStatus: (id, status) => update('drives', id, { status }, ['status']),
    deleteDrive: id => remove('drives', id),
    getStudentDrives: studentId => rows(client.rpc('get_student_drives', { p_student_id: studentId })),
    applyToDrive: (studentId, driveId) => row(client.from('applications').insert({ student_id: studentId, drive_id: driveId })),
    getStudentApplications: studentId => rows(client.from('applications')
      .select('*, drives(*, companies(*)), offers(*)').eq('student_id', studentId)
      .order('applied_at', { ascending: false })),
    listDriveApplications: driveId => rows(client.from('applications')
      .select('*, students(*), offers(*)').eq('drive_id', driveId).order('applied_at')),
    updateApplicationStatus: (id, status) => update('applications', id, { status }, ['status']),
    withdrawApplication: id => update('applications', id, { status: 'withdrawn' }, ['status']),
    deleteApplication: id => remove('applications', id),
    createOffer: (applicationId, offer = {}) => row(client.from('offers').insert({
      ...(!Object.keys(offer).length ? {} : fields(offer, ['status', 'annual_ctc_minor', 'currency'])),
      application_id: applicationId,
    })),
    listApplicationOffers: applicationId => rows(client.from('offers').select('*')
      .eq('application_id', applicationId).order('created_at')),
    updateOffer: (id, changes) => update('offers', id, changes, ['annual_ctc_minor', 'currency']),
    updateOfferStatus: (id, status) => update('offers', id, { status }, ['status']),
    deleteOffer: id => remove('offers', id),
    getRecruitmentSuccessCounts: async (driveId = null) => {
      const result = await rows(client.rpc('get_recruitment_success_counts', { p_drive_id: driveId }));
      return result[0];
    },
  };
}
