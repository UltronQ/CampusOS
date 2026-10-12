import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { createTestDatabase,withUser,readProjectFile } from './helpers/database.js';
import { DEMO_ACCOUNTS,DEMO_EXPECTED,demoId,DEMO_DEPARTMENTS } from './fixtures/demoData.js';
import { linkDemoStudents } from '../../scripts/demo/provisionDemo.js';
import { createPlacementAnalyticsService } from '../features/analytics/placementAnalytics.js';
import { createReportingService } from '../features/reports/exportReport.js';
import { createStudentManagementService } from '../services/studentManagementService.js';
import { createStudentImportService } from '../features/import/studentImport.js';

test('M3-5 deterministic 30-student database acceptance',async(t)=>{
  const db=await createTestDatabase(),seed=await readProjectFile('supabase/seed/demo.seed.sql');
  const accounts=DEMO_ACCOUNTS.map((a,i)=>({...a,user_id:demoId('a1',i+1)})),admin=accounts[0].user_id;
  let actor=admin,commits=0;
  const client={rpc:async(name,args={})=>{
    const mapping={
      get_placement_analytics_snapshot:['SELECT public.get_placement_analytics_snapshot() AS value',[]],
      get_campusos_report_snapshot:['SELECT public.get_campusos_report_snapshot($1) AS value',[args.p_kind]],
      get_student_import_context:['SELECT public.get_student_import_context() AS value',[]],
      commit_student_import:['SELECT public.commit_student_import($1::jsonb,$2,$3) AS value',[JSON.stringify(args.p_rows),args.p_confirmed,args.p_mode]],
    };
    if(name==='commit_student_import')commits++;
    const [sql,parameters]=mapping[name];
    try{return{data:(await withUser(db,actor,()=>db.query(sql,parameters))).rows[0].value,error:null};}catch(error){return{data:null,error};}
  }};
  const placement=createPlacementAnalyticsService(()=>client),reports=createReportingService(()=>client);
  const query=(sql,parameters=[],id=actor)=>withUser(db,id,()=>db.query(sql,parameters));
  const scenario=async(name,fn)=>t.test(name,async()=>{
    actor=admin;await db.exec('BEGIN');
    try{await fn();}finally{await db.exec('ROLLBACK');actor=admin;}
  });
  const rejected=async(sql,parameters,codes,id=actor)=>withUser(db,id,async()=>{
    await db.exec('SAVEPOINT expected_rejection');
    try{await assert.rejects(db.query(sql,parameters),(e)=>codes.includes(e.code));}
    finally{await db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection');}
  });
  try {
    await t.test('seed requires an existing in-charge and creates no fake authentication identities',async()=>{
      await assert.rejects(db.exec(seed),{code:'42501'});await db.exec('ROLLBACK');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM students')).rows[0].n,0);
      assert.doesNotMatch(seed,/INSERT INTO\s+(public\.)?profiles|INSERT INTO\s+auth\.users/i);
    });
    for(const account of accounts) {
      await db.query('INSERT INTO auth.users(id) VALUES($1)',[account.user_id]);
      await db.query('INSERT INTO profiles(id,role) VALUES($1,$2)',[account.user_id,account.role]);
    }
    await db.exec(seed);await linkDemoStudents(db,accounts);
    await t.test('minimums, stable IDs, repeatability, non-overwrite and lifecycle guard restoration',async()=>{
      const before=(await db.query('SELECT tgname,tgenabled FROM pg_trigger WHERE tgname LIKE \'guard_%\' ORDER BY tgname')).rows;
      await db.exec(seed);
      for(const [table,count] of [['departments',3],['students',30],['drives',5]])assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,count);
      assert.deepEqual((await db.query('SELECT tgname,tgenabled FROM pg_trigger WHERE tgname LIKE \'guard_%\' ORDER BY tgname')).rows,before);
      assert.ok(before.every((r)=>r.tgenabled==='O'));
      assert.equal((await db.query('SELECT user_id FROM students WHERE id=$1',[demoId('90',1)])).rows[0].user_id,accounts[1].user_id);
    });
    await scenario('analytics denominator, registration, unique placements and valid packages match independently recorded expectations',async()=>{
      const result=await placement.getPlacementAnalytics();
      for(const key of ['total_students','registered_students','eligible_students','participating_students','applications','placed_students','unplaced_students','successful_offers','students_with_multiple_offers'])assert.equal(result[key],DEMO_EXPECTED[key],key);
      assert.deepEqual(result.placement_rate,{numerator:4,denominator:30,percent:13.33});
      assert.equal(result.salary.count,4);assert.equal(result.salary.max_minor,120000000);assert.equal(result.salary.mean_minor,90000000);
      assert.equal(result.by_department.reduce((n,d)=>n+d.placed_students,0),4);
      assert.equal(result.batch_trends.length,2);
    });
    await scenario('department/batch/company/status filters intersect and excluded outcomes never become placements',async()=>{
      const cse=await placement.getPlacementAnalytics({department_ids:[DEMO_DEPARTMENTS[0].id]});assert.equal(cse.placement_rate.percent,20);
      const batch=await placement.getPlacementAnalytics({graduation_years:[2027]});assert.equal(batch.total_students,15);assert.equal(batch.placed_students,2);assert.equal(batch.successful_offers,3);
      const cancelled=await placement.getPlacementAnalytics({drive_statuses:['cancelled']});assert.equal(cancelled.successful_offers,0);assert.equal(cancelled.placement_rate.denominator,30);assert.equal(cancelled.salary.max_minor,null);
      const company=await placement.getPlacementAnalytics({department_ids:[DEMO_DEPARTMENTS[0].id],company_ids:[demoId('91',1)],drive_statuses:['published']});assert.equal(company.successful_offers,2);assert.equal(company.placed_students,2);
    });
    await scenario('student CRUD persists across reads and permitted unlinked deletion; invalid values fail',async()=>{
      const id=(await query('INSERT INTO students(student_number,full_name,email,department_id,graduation_year) VALUES($1,$2,$3,$4,$5) RETURNING id',['DEMO-CRUD','Demo CRUD','crud@example.test',DEMO_DEPARTMENTS[0].id,2027])).rows[0].id;
      await query('UPDATE students SET full_name=$1,cgpa=10 WHERE id=$2',['Demo Updated',id]);
      assert.equal((await query('SELECT full_name FROM students WHERE id=$1',[id])).rows[0].full_name,'Demo Updated');
      await rejected('UPDATE students SET email=$1 WHERE id=$2',['bad-email',id],['23514']);
      await rejected('INSERT INTO students(student_number,full_name,email,department_id,graduation_year) VALUES($1,$2,$3,$4,$5)',['DENIED','Demo Denied','denied@example.test',DEMO_DEPARTMENTS[0].id,2027],['42501'],accounts[1].user_id);
      assert.equal((await query('DELETE FROM students WHERE id=$1 RETURNING id',[id])).rows.length,1);
    });
    await scenario('eligibility and identity ownership are enforced in the database',async()=>{
      const yes=await query('SELECT public.recruitment_eligible(s,d) AS eligible FROM students s CROSS JOIN drives d WHERE s.id=$1 AND d.id=$2',[demoId('90',1),demoId('92',1)]);assert.equal(yes.rows[0].eligible,true);
      const no=await query('SELECT public.recruitment_eligible(s,d) AS eligible FROM students s CROSS JOIN drives d WHERE s.id=$1 AND d.id=$2',[demoId('90',3),demoId('92',1)]);assert.equal(no.rows[0].eligible,false);
      const own=await query('SELECT id FROM public.get_student_drives($1)',[demoId('90',1)],accounts[1].user_id);assert.deepEqual(own.rows.map((r)=>r.id),[demoId('92',1)]);
      await rejected('SELECT public.get_student_drives($1)',[demoId('90',12)],['42501'],accounts[1].user_id);
    });
    await scenario('linked student, drive, company and clearance-item deletes are blocked without losing history',async()=>{
      for(const [table,id] of [['students',demoId('90',1)],['drives',demoId('92',1)],['companies',demoId('91',1)],['clearance_items',demoId('94',1)]])await rejected(`DELETE FROM ${table} WHERE id=$1`,[id],['23503','23001']);
      assert.equal((await query('SELECT count(*)::int AS n FROM offers')).rows[0].n,9);
    });
    await scenario('CSV preview is read-only, confirmation is explicit, partial outcomes reconcile and existing students are not overwritten',async()=>{
      const importer=createStudentImportService(createStudentManagementService(()=>client));
      const header='student_number,full_name,email,department_code,graduation_year\r\n';
      const file={name:'acceptance.csv',arrayBuffer:async()=>new TextEncoder().encode(header+[
        'DEMO-031,New Demo,newdemo31@example.test,CSE,2027','DEMO-001,Overwrite Demo,overwrite@example.test,CSE,2027',
        ',Missing Roll,missing@example.test,CSE,2027','DEMO-033,Bad Email,bad,CSE,2027',
        'DEMO-034,Duplicate One,dup1@example.test,CSE,2027','DEMO-034,Duplicate Two,dup2@example.test,CSE,2027',
      ].join('\r\n')).buffer};
      const preview=await importer.previewFile(file,{mode:'partial'});assert.equal(preview.insert_count,1);assert.equal(commits,0);
      await assert.rejects(importer.confirmImport(preview,{confirmed:false,mode:'partial'}));assert.equal(commits,0);
      const result=await importer.confirmImport(preview,{confirmed:true,mode:'partial'});
      assert.deepEqual([result.successful_count,result.skipped_count,result.failed_count,result.total_count],[1,3,2,6]);
      assert.equal((await query('SELECT full_name FROM students WHERE id=$1',[demoId('90',1)])).rows[0].full_name,'Demo Student 01');
    });
    await scenario('no-dues counts, optional rejection, missing mandatory items and no configuration produce correct statuses',async()=>{
      const progress=(await query('SELECT public.get_no_dues_progress() AS value')).rows[0].value;
      for(const key of ['cleared_students','incomplete_students','not_configured_students','mandatory_total','mandatory_cleared','mandatory_not_applicable','mandatory_pending','mandatory_rejected','mandatory_missing'])assert.equal(progress.totals[key],DEMO_EXPECTED[key],key);
      const statement=async(n)=>(await query('SELECT public.get_student_no_dues_statement($1) AS value',[demoId('90',n)])).rows[0].value;
      assert.equal((await statement(1)).overall_status,'cleared');assert.equal((await statement(4)).overall_status,'incomplete');assert.equal((await statement(21)).overall_status,'not_configured');
      await query("UPDATE student_clearances SET status='cleared',pending_requirements='{}' WHERE student_id=$1 AND clearance_item_id=$2",[demoId('90',2),demoId('94',1)]);
      const approved=await statement(2);assert.equal(approved.overall_status,'cleared');assert.ok(approved.items.find((r)=>r.clearance_item_id===demoId('94',1)).approved_at);
      await rejected("INSERT INTO student_clearances(student_id,clearance_item_id,status) VALUES($1,$2,'pending')",[demoId('90',4),demoId('94',2)],['42501'],accounts[1].user_id);
      await rejected("INSERT INTO student_clearances(student_id,clearance_item_id,status) VALUES($1,$2,'pending')",[demoId('90',1),demoId('94',5)],['23514']);
    });
    await scenario('mandatory CSV/Excel exports contain selected IDs, real values and full server clearance statements',async()=>{
      const csv=await reports.exportReport({kind:'student_placement_history',format:'csv',filters:{department_ids:[DEMO_DEPARTMENTS[0].id]}});
      const records=Papa.parse(await csv.blob.text(),{header:true,skipEmptyLines:true}).data;assert.equal(records.length,10);assert.equal(records[0]['Valid Offer Count'],'2');assert.equal(records[1]['Valid Offer Count'],'1');
      const excel=await reports.exportReport({kind:'no_dues_statement',format:'xlsx',filters:{department_ids:[DEMO_DEPARTMENTS[1].id]}});
      const book=XLSX.read(await excel.blob.arrayBuffer(),{type:'array'}),rows=XLSX.utils.sheet_to_json(book.Sheets.Report);
      assert.equal(rows.length,10);assert.equal(rows.filter((r)=>r['Overall No-Dues Status']==='cleared').length,2);assert.equal(XLSX.utils.sheet_to_json(book.Sheets['Checklist items']).length,30);
      assert.equal(book.Sheets.Report.A2.t,'s');
      actor=accounts[1].user_id;const privateReport=await reports.getReport({kind:'student_placement_history'});assert.equal(privateReport.rows.length,1);assert.equal(privateReport.rows[0].student_id,demoId('90',1));
      assert.match(privateReport.rows[0].published_stage_results,/Demo Interview/);assert.doesNotMatch(privateReport.rows[0].published_stage_results,/Technical/);
      assert.equal((await reports.getReport({kind:'student_placement_history',student_ids:[demoId('90',12)]})).rows.length,0);
    });
    await scenario('every demo profile has exactly its intended role and student scope; students cannot call consolidated reports',async()=>{
      for(const account of accounts) {
        const profile=await query('SELECT id,role FROM profiles WHERE id=$1',[account.user_id],account.user_id);assert.equal(profile.rows[0].role,account.role);
        if(account.student_id){const own=await query('SELECT id FROM students',[],account.user_id);assert.deepEqual(own.rows.map((r)=>r.id),[account.student_id]);await rejected("SELECT public.get_campusos_report_snapshot('department_placement')",[],['42501'],account.user_id);}
      }
    });
  }finally{await db.close();}
});
