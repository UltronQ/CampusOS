import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { analyticsFixture } from './fixtures/placementAnalytics.fixture.js';
import { buildReport, normalizeReportInput, serializeReport, createReportingService } from '../features/reports/exportReport.js';
import { sanitizeCsvCell } from '../utils/csvSafety.js';

const filters={department_ids:[],graduation_years:[]};
function snapshot(kind) {
  const data=analyticsFixture();data.report_kind=kind;
  data.students=data.students.map((s,index)=>({...s,student_number:String(index+6).padStart(3,'0'),full_name:'Demo '+s.id,email:s.id+'@example.test',eligibility_status:'pending'}));
  data.published_stages=[{id:'stage1',application_id:'a1',name:'Interview',status:'passed',published_at:'2026-10-12T09:00:00Z'}, {id:'stage2',application_id:'a1',name:'Private stage',status:'failed',published_at:null}];
  const item=(name,status,is_missing=false,is_mandatory=true)=>({name,status,is_missing,is_mandatory,pending_requirements:status==='rejected'?['Return book']:[],remarks:status==='rejected'?'Action needed':null,approved_at:['cleared','not_applicable'].includes(status)?data.snapshot_at:null,updated_at:data.snapshot_at});
  data.no_dues_statements=data.students.map((s,index)=>{
    const items=index===0?[item('Library','cleared'),item('Lab','not_applicable'),item('Optional survey','rejected',false,false)]
      :index===1?[item('Library','pending'),item('Lab','pending',true)]
      :index===2?[]:[item('Library',index===4?'rejected':'cleared')];
    const mandatory=items.filter((i)=>i.is_mandatory);
    const count=(status)=>mandatory.filter((i)=>!i.is_missing && i.status===status).length;
    return {student_id:s.id,student_number:s.student_number,full_name:s.full_name,department_code:s.department_id.toUpperCase(),graduation_year:s.graduation_year,items,
      mandatory_total:mandatory.length,mandatory_cleared:count('cleared'),mandatory_not_applicable:count('not_applicable'),mandatory_pending:count('pending'),mandatory_rejected:count('rejected'),mandatory_missing:mandatory.filter((i)=>i.is_missing).length,
      overall_status:mandatory.length===0?'not_configured':mandatory.every((i)=>!i.is_missing&&['cleared','not_applicable'].includes(i.status))?'cleared':'incomplete'};
  });return data;
}
const report=(kind,extra={})=>buildReport(snapshot(kind),{kind,filters,...extra});

test('department/company reports reuse distinct placement analytics and selected filter intersections',()=>{
  const departments=report('department_placement',{filters:{department_ids:['cse'],graduation_years:[2027],company_ids:['c2'],drive_statuses:['completed']}});
  assert.equal(departments.rows.length,1);assert.equal(departments.rows[0].total_students,3);assert.equal(departments.rows[0].placed_students,1);assert.equal(departments.rows[0].placement_percent,33.33);
  const companies=report('company_outcomes');assert.equal(companies.rows[0].selections,3);assert.equal(companies.rows[0].offers,2);
});
test('student history retains multiple offers and published results; unplaced list includes nonparticipants',()=>{
  const history=report('student_placement_history');
  const s1=history.rows.find((r)=>r.student_id==='s1');assert.equal(s1.successful_offer_count,2);assert.equal(s1.placed,true);
  assert.match(s1.published_stage_results,/Interview: passed/);assert.doesNotMatch(s1.published_stage_results,/Private/);
  assert.match(s1.offer_history,/Demo One/);assert.match(s1.offer_history,/Demo Two/);
  assert.deepEqual(report('unplaced_students').rows.map((r)=>r.student_id).sort(),['s3','s4','s5','s6']);
  assert.equal(report('student_placement_history',{filters:{drive_statuses:['cancelled']}}).rows.filter((r)=>r.placed).length,0);
});
test('no-dues reports use all mandatory decisions despite narrowed columns; pending includes missing/rejected/unconfigured',()=>{
  const statements=report('no_dues_statement',{student_ids:['s1'],columns:['student_number','overall_status']});
  assert.equal(statements.rows[0].overall_status,'cleared');assert.equal(statements.item_rows.length,3);
  const pending=report('pending_no_dues',{filters:{department_ids:['cse'],graduation_years:[2027]}});
  assert.deepEqual(pending.rows.map((r)=>r.student_id),['s2','s5']);
  assert.equal(pending.rows[0].mandatory_missing,1);assert.match(pending.rows[1].pending_requirements,/Return book/);
  assert.ok(report('pending_no_dues').rows.some((r)=>r.overall_status==='not_configured'));
  const bad=snapshot('no_dues_statement');bad.no_dues_statements[1].overall_status='cleared';
  assert.throws(()=>buildReport(bad,{kind:'no_dues_statement',filters}),{code:'DATABASE_ERROR'});
});
test('batch summary requires one batch, reports real packages and null when unavailable',()=>{
  assert.throws(()=>report('batch_placement_summary'),{code:'INVALID_INPUT'});
  const summary=report('batch_placement_summary',{filters:{graduation_years:[2027]}}).rows[0];
  assert.equal(summary.total_students,3);assert.equal(summary.placed_students,2);assert.equal(summary.successful_offers,3);
  assert.equal(summary.highest_package_minor,200);assert.equal(summary.average_package_minor,150);
  assert.equal(report('batch_placement_summary',{filters:{graduation_years:[2028]}}).rows[0].highest_package_minor,null);
});
test('CSV exported values reflect filters, safe text, real headings, typed booleans and meaningful dates',async()=>{
  const data=snapshot('student_placement_history');data.students[0].full_name='  =HYPERLINK("bad")\nDemo, Student';
  const result=buildReport(data,{kind:'student_placement_history',filters:{department_ids:['cse']},student_ids:['s1'],columns:['student_number','full_name','placed','successful_offer_count']});
  const output=serializeReport(result,'csv');const parsed=Papa.parse(await output.blob.text(),{header:true,skipEmptyLines:true});
  assert.deepEqual(parsed.meta.fields,['Roll Number','Student Name','Placed','Valid Offer Count']);
  assert.equal(parsed.data.length,1);assert.equal(parsed.data[0]['Roll Number'],'006');assert.equal(parsed.data[0]['Valid Offer Count'],'2');
  assert.equal(parsed.data[0]['Placed'],'true');assert.ok(parsed.data[0]['Student Name'].startsWith("'"));
  assert.match(output.filename,/campusos_student_placement_history_2026-10-12T10-00-00-000Z.csv/);
  assert.equal(sanitizeCsvCell(-1),'-1');assert.equal(sanitizeCsvCell(' \t=bad'),"' \t=bad");
});
test('Excel preserves text identifiers, no formulas, checklist details and metadata; row counts reconcile',async()=>{
  const data=snapshot('no_dues_statement');data.students[0].full_name='=1+1';data.no_dues_statements[0].full_name='=1+1';
  const result=buildReport(data,{kind:'no_dues_statement',filters,student_ids:['s1']});const output=serializeReport(result,'xlsx');
  const wb=XLSX.read(await output.blob.arrayBuffer(),{type:'array'});
  assert.deepEqual(wb.SheetNames,['Report','Checklist items','Metadata']);
  assert.equal(wb.Sheets.Report.A2.t,'s');assert.equal(wb.Sheets.Report.A2.v,'006');
  assert.equal(wb.Sheets.Report.B2.t,'s');assert.equal(wb.Sheets.Report.B2.v,'=1+1');assert.equal(wb.Sheets.Report.B2.f,undefined);
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['Checklist items']).length,3);
  assert.match(XLSX.utils.sheet_to_json(wb.Sheets.Metadata).find((r)=>r.Field==='Filters').Value,/Departments: All/);
  assert.ok(result.filter_summary.some((text)=>text.includes('006 — =1+1')));
  assert.equal(output.report_row_count,1);assert.equal(output.row_count,output.sheets.reduce((sum,s)=>sum+s.row_count,0));
});
test('empty CSV/Excel exports keep headings, column/input validation fails before queries and export limits never truncate',async()=>{
  const empty=report('unplaced_students',{student_ids:['missing']});
  const csv=serializeReport(empty);assert.equal(Papa.parse(await csv.blob.text(),{header:true,skipEmptyLines:true}).data.length,0);
  const wb=XLSX.read(await serializeReport(empty,'xlsx').blob.arrayBuffer(),{type:'array'});assert.equal(wb.Sheets.Report.A1.v,'Roll Number');
  for(const input of [{kind:'toString'},{kind:'unknown'},{kind:'no_dues_statement',filters:{company_ids:['c1']}},{kind:'placement_summary',columns:['secret']},{kind:'placement_summary',columns:['full_name','full_name']},{kind:'company_outcomes',student_ids:['s1']},{kind:'placement_summary',actor:'admin'}]) assert.throws(()=>normalizeReportInput(input),{code:'INVALID_INPUT'});
  assert.throws(()=>serializeReport({...empty,rows:Array(50001).fill({}),item_rows:[]}),{code:'EXPORT_LIMIT'});
});
test('export service performs a fresh authorized RPC for every export and fails without a fabricated file',async()=>{
  let calls=0;const input={kind:'student_placement_history',filters,student_ids:['s1']};
  const service=createReportingService(()=>({rpc:async(name,args)=>{assert.equal(name,'get_campusos_report_snapshot');assert.equal(args.p_kind,input.kind);calls++;const data=snapshot(input.kind);data.students[0].full_name='Snapshot '+calls;return{data,error:null};}}));
  await service.getReport(input);const output=await service.exportReport({...input,format:'csv'});assert.equal(calls,2);assert.match(await output.blob.text(),/Snapshot 2/);
  const denied=createReportingService(()=>({rpc:async()=>({error:{code:'42501',message:'Access denied'}})}));await assert.rejects(denied.exportReport(input),{code:'FORBIDDEN'});
});
