import { calculatePlacementAnalytics, normalizePlacementFilters, isStudentEligibleForDrive } from '../analytics/placementAnalytics.js';
import { DATA_CONTRACT_VERSION } from '../data/contracts.js';
import { REPORT_DEFINITIONS, ITEM_COLUMNS } from './reportDefinitions.js';

const error = (message) => Object.assign(new Error(message), { code:'INVALID_INPUT' });
const compare = (a,b) => String(a??'') < String(b??'') ? -1 : String(a??'') > String(b??'') ? 1 : 0;
export function normalizeReportInput(input) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw error('Report input must be an object.');
  if (Object.keys(input).some((k)=>!['kind','format','filters','student_ids','columns'].includes(k))) throw error('Unsupported report input field.');
  if (typeof input.kind!=='string' || !Object.hasOwn(REPORT_DEFINITIONS,input.kind)) throw error('Unsupported report kind.');
  const definition = REPORT_DEFINITIONS[input.kind];
  const format = input.format??'csv';
  if (!['csv','xlsx'].includes(format)) throw error('Choose CSV or Excel.');
  const f = input.filters??{};
  if (definition.family==='no_dues' && Object.keys(f).some((key)=>!['department_ids','graduation_years'].includes(key))) throw error('No-dues filters support department and graduation batch only.');
  const normalized = normalizePlacementFilters(f);
  const filters = definition.family==='no_dues' ? {department_ids:normalized.department_ids,graduation_years:normalized.graduation_years} : normalized;
  const student_ids = input.student_ids??[];
  if (!Array.isArray(student_ids) || student_ids.some((id)=>typeof id!=='string'||!id||id.trim()!==id)) throw error('Invalid student identifiers.');
  if (student_ids.length && ['department_placement','company_outcomes','batch_placement_summary'].includes(input.kind)) throw error('Student narrowing is supported on student reports only.');
  const columns = input.columns??[];
  if (!Array.isArray(columns) || new Set(columns).size!==columns.length || columns.some((key)=>!definition.columns.some((c)=>c.key===key))) throw error('Unsupported or duplicate report columns.');
  if (input.kind==='batch_placement_summary' && filters.graduation_years.length!==1) throw error('Select exactly one graduation batch for the final placement summary.');
  return {kind:input.kind,format,filters,student_ids:[...new Set(student_ids)].sort(compare),columns};
}

/** Rendering and exports share this calculation; the server already scoped private records. */
export function buildReport(snapshot, rawInput) {
  const input = normalizeReportInput(rawInput);
  if (!snapshot || snapshot.report_kind!==input.kind) throw Object.assign(new Error('Report snapshot kind does not match the request.'), {code:'DATABASE_ERROR'});
  const definition = REPORT_DEFINITIONS[input.kind];
  const source = {...snapshot,students:snapshot.students.filter((s)=>!input.student_ids.length||input.student_ids.includes(s.id))};
  const stats = calculatePlacementAnalytics(source,input.filters);
  const cohort = source.students.filter((s)=>(!input.filters.department_ids.length||input.filters.department_ids.includes(s.department_id)) && (!input.filters.graduation_years.length||input.filters.graduation_years.includes(s.graduation_year)));
  const depts = new Map(snapshot.departments.map((d)=>[d.id,d]));
  const drives = new Map(snapshot.drives.filter((d)=>(!input.filters.company_ids?.length||input.filters.company_ids.includes(d.company_id)) && (!input.filters.drive_ids?.length||input.filters.drive_ids.includes(d.id)) && (!input.filters.drive_statuses?.length||input.filters.drive_statuses.includes(d.status)) && (!input.filters.drive_start_from||d.start_date>=input.filters.drive_start_from) && (!input.filters.drive_start_to||d.start_date<=input.filters.drive_start_to)).map((d)=>[d.id,d]));
  const companies = new Map(snapshot.companies.map((c)=>[c.id,c]));
  const applications = snapshot.applications.filter((a)=>drives.has(a.drive_id));
  const validOffer = (offer,app,s) => ['offered','accepted'].includes(offer.status) && app.status==='selected' && ['published','completed'].includes(drives.get(app.drive_id).status) && isStudentEligibleForDrive(s,drives.get(app.drive_id),snapshot.drive_departments);
  const identity = (s) => ({student_id:s.id,student_number:s.student_number,full_name:s.full_name,email:s.email,department_code:depts.get(s.department_id).code,graduation_year:s.graduation_year});
  const sortStudents = (a,b) => compare(a.department_code,b.department_code)||compare(a.student_number,b.student_number)||compare(a.student_id,b.student_id)||compare(a.offer_id,b.offer_id);
  let rows; let item_rows=[];
  if (input.kind==='department_placement') rows=stats.by_department.map((r)=>({...r,placement_percent:r.placement_rate.percent}));
  else if (input.kind==='company_outcomes') rows=stats.companies;
  else if (input.kind==='batch_placement_summary') rows=[{...stats,graduation_year:input.filters.graduation_years[0],placement_percent:stats.placement_rate.percent,salary_count:stats.salary.count,highest_package_minor:stats.salary.max_minor,average_package_minor:stats.salary.mean_minor}];
  else if (definition.family==='no_dues') {
    if (!Array.isArray(snapshot.no_dues_statements)) throw Object.assign(new Error('Missing trusted no-dues statements.'),{code:'DATABASE_ERROR'});
    const statements=new Map(snapshot.no_dues_statements.map((s)=>[s.student_id,s]));
    rows=cohort.map((student)=>{
      const statement=statements.get(student.id);
      if (!statement || !Array.isArray(statement.items) || !['cleared','incomplete','not_configured'].includes(statement.overall_status) ||
        (statement.overall_status==='cleared' && (statement.mandatory_total===0 || statement.mandatory_cleared+statement.mandatory_not_applicable!==statement.mandatory_total))) {
        throw Object.assign(new Error('Incomplete or inconsistent trusted clearance statement.'),{code:'DATABASE_ERROR'});
      }
      return {...identity(student),...statement,
        pending_requirements:statement.items.filter((i)=>i.is_mandatory && (i.is_missing||['pending','rejected'].includes(i.status))).map((i)=>i.name+': '+(i.is_missing?'Missing decision':i.pending_requirements.join('; ')||i.status)).join(' | '),
        remarks:statement.items.filter((i)=>i.remarks).map((i)=>i.name+': '+i.remarks).join(' | ')};
    });
    if (input.kind==='pending_no_dues') rows=rows.filter((r)=>r.overall_status!=='cleared');
    rows.sort(sortStudents);
    item_rows=rows.flatMap((r)=>r.items.map((item)=>({...identity(cohort.find((s)=>s.id===r.student_id)),overall_status:r.overall_status,...item,pending_requirements:item.pending_requirements.join('; ')})));
  } else if (input.kind==='placement_offers') {
    rows=cohort.flatMap((s)=>applications.filter((a)=>a.student_id===s.id).flatMap((a)=>snapshot.offers.filter((o)=>o.application_id===a.id && validOffer(o,a,s)).map((o)=>({
      ...identity(s),company_name:companies.get(drives.get(a.drive_id).company_id).name,drive_title:drives.get(a.drive_id).title,application_status:a.status,offer_id:o.id,offer_status:o.status,annual_ctc_minor:o.annual_ctc_minor,currency:o.currency,
    })))); rows.sort(sortStudents);
  } else {
    rows=cohort.map((s)=>{
      const apps=applications.filter((a)=>a.student_id===s.id).sort((a,b)=>compare(a.drive_id,b.drive_id)||compare(a.id,b.id));
      const appMap=new Map(apps.map((a)=>[a.id,a]));
      const offers=snapshot.offers.filter((o)=>appMap.has(o.application_id)).sort((a,b)=>compare(a.id,b.id));
      const successful=offers.filter((o)=>validOffer(o,appMap.get(o.application_id),s));
      return {...identity(s),placement_registered:s.placement_registered===true,eligibility_status:s.eligibility_status??null,placed:successful.length>0,successful_offer_count:successful.length,application_count:apps.length,
        application_history:apps.map((a)=>drives.get(a.drive_id).title+' ['+a.status+'; drive '+drives.get(a.drive_id).status+']').join(' | '),
        offer_history:offers.map((o)=>companies.get(drives.get(appMap.get(o.application_id).drive_id).company_id).name+' ['+o.status+'; '+(o.annual_ctc_minor===null?'Package unavailable':o.annual_ctc_minor+' '+o.currency+' minor units')+']').join(' | '),
        published_stage_results:(snapshot.published_stages??[]).filter((stage)=>appMap.has(stage.application_id) && stage.published_at).map((stage)=>stage.name+': '+stage.status).join(' | ')};
    });
    if (input.kind==='unplaced_students') rows=rows.filter((r)=>!r.placed);
    rows.sort(sortStudents);
  }
  const columns=input.columns.length?input.columns.map((key)=>definition.columns.find((c)=>c.key===key)):definition.columns;
  const names=(ids,map,field)=>ids.length?ids.map((id)=>map.get(id)?.[field]??'No matching record').join(', '):'All';
  const filter_summary=[
    'Departments: '+names(input.filters.department_ids,depts,'code'),
    'Graduation batches: '+(input.filters.graduation_years.join(', ')||'All'),
  ];
  if(definition.family==='placement') {
    const labels={draft:'Planned',published:'Open',completed:'Completed',cancelled:'Cancelled'};
    filter_summary.push('Companies: '+names(input.filters.company_ids,companies,'name'),
      'Recruitment status: '+input.filters.drive_statuses.map((status)=>labels[status]).join(', '));
    if(input.filters.drive_ids.length) filter_summary.push('Drives: '+names(input.filters.drive_ids,new Map(snapshot.drives.map((d)=>[d.id,d])),'title'));
    if(input.filters.drive_start_from||input.filters.drive_start_to) filter_summary.push('Drive start dates: '+(input.filters.drive_start_from??'Any')+' to '+(input.filters.drive_start_to??'Any'));
  }
  if(input.student_ids.length) filter_summary.push('Students: '+(cohort.map((s)=>s.student_number+' — '+s.full_name).join(', ')||'No matching authorized student'));
  return {contract_version:DATA_CONTRACT_VERSION,title:definition.title,kind:input.kind,snapshot_at:snapshot.snapshot_at,filters:input.filters,student_ids:input.student_ids,columns,rows,row_count:rows.length,item_rows,item_columns:ITEM_COLUMNS,
    filter_summary,
    placement_denominator:definition.family==='placement'?'cohort_students':null,
    available_graduation_years:stats.available_graduation_years,students:cohort.map((s)=>({id:s.id,student_number:s.student_number,full_name:s.full_name})),departments:snapshot.departments,companies:snapshot.companies};
}
