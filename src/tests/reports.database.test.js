import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { createTestDatabase, withUser, readProjectFile } from './helpers/database.js';
import { createReportingService } from '../features/reports/exportReport.js';

test('real reports and exports enforce trusted role/own-student scope and reflect current database values',async()=>{
  const db=await createTestDatabase();
  const admin='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',user='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',other='cccccccc-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const own='00000000-0000-0000-0000-000000000001',notOwn='00000000-0000-0000-0000-000000000002';
  let actor=admin;
  try {
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2),($3)',[admin,user,other]);
    await db.query("INSERT INTO profiles(id,role) VALUES ($1,'placement_incharge'),($2,'student'),($3,'student')",[admin,user,other]);
    await db.exec(await readProjectFile('supabase/seed/seed.sql'));
    await db.query('UPDATE students SET user_id=$1 WHERE id=$2',[user,own]);await db.query('UPDATE students SET user_id=$1 WHERE id=$2',[other,notOwn]);
    const service=createReportingService(()=>({rpc:async(name,args)=>{
      assert.equal(name,'get_campusos_report_snapshot');
      try {return{data:(await withUser(db,actor,()=>db.query('SELECT public.get_campusos_report_snapshot($1) AS data',[args.p_kind]))).rows[0].data,error:null};}
      catch(e){return{data:null,error:e};}
    }}));
    const filters={department_ids:[],graduation_years:[]};
    const department=await service.getReport({kind:'department_placement',filters});
    assert.equal(department.rows.reduce((n,r)=>n+r.placed_students,0),2);assert.equal(department.rows.reduce((n,r)=>n+r.successful_offers,0),3);
    const company=await service.getReport({kind:'company_outcomes',filters});assert.equal(company.rows.reduce((n,r)=>n+r.offers,0),3);
    const history=await service.getReport({kind:'student_placement_history',filters});assert.equal(history.rows.find((r)=>r.student_id===own).successful_offer_count,2);
    assert.deepEqual((await service.getReport({kind:'unplaced_students',filters})).rows.map((r)=>r.student_number),['002','003','005']);
    const noDues=await service.getReport({kind:'no_dues_statement',filters,student_ids:[own]});assert.equal(noDues.rows[0].overall_status,'cleared');assert.equal(noDues.item_rows.length,3);
    const pending=await service.exportReport({kind:'pending_no_dues',filters:{department_ids:['11111111-1111-1111-1111-111111111111'],graduation_years:[2027]},format:'csv'});
    assert.deepEqual(Papa.parse(await pending.blob.text(),{header:true,skipEmptyLines:true}).data.map((r)=>r['Roll Number']),['002','003']);
    const batch=await service.getReport({kind:'batch_placement_summary',filters:{graduation_years:[2027]}});assert.equal(batch.rows[0].placement_percent,40);
    assert.equal(batch.rows[0].highest_package_minor,20000000);
    await db.query('UPDATE students SET full_name=$1 WHERE id=$2',['Updated Demo Student',own]);
    const current=await service.exportReport({kind:'student_placement_history',filters,student_ids:[own],format:'xlsx'});
    const wb=XLSX.read(await current.blob.arrayBuffer(),{type:'array'});assert.equal(wb.Sheets.Report.B2.v,'Updated Demo Student');assert.equal(wb.Sheets.Report.A2.v,'001');
    actor=user;
    const privateReport=await service.getReport({kind:'student_placement_history',filters});assert.equal(privateReport.rows.length,1);assert.equal(privateReport.rows[0].student_id,own);
    assert.equal((await service.getReport({kind:'student_placement_history',filters,student_ids:[notOwn]})).rows.length,0);
    const raw=(await withUser(db,user,()=>db.query("SELECT public.get_campusos_report_snapshot('no_dues_statement') AS data"))).rows[0].data;
    assert.deepEqual(raw.students.map((s)=>s.id),[own]);assert.ok(raw.applications.every((a)=>a.student_id===own));assert.deepEqual(raw.no_dues_statements.map((s)=>s.student_id),[own]);
    assert.equal((await service.getReport({kind:'no_dues_statement',filters})).rows.length,1);
    for(const kind of ['department_placement','company_outcomes','unplaced_students','pending_no_dues','batch_placement_summary']) {
      await assert.rejects(withUser(db,user,()=>db.query('SELECT public.get_campusos_report_snapshot($1)',[kind])),{code:'42501'});
    }
    await assert.rejects(service.exportReport({kind:'pending_no_dues',filters,format:'csv'}),{code:'FORBIDDEN'});
    await assert.rejects(withUser(db,null,()=>db.query("SELECT public.get_campusos_report_snapshot('placement_summary')")),{code:'42501'});
    await assert.rejects(withUser(db,null,()=>db.query("SELECT public.get_campusos_report_snapshot('placement_summary')"),'anon'),{code:'42501'});
  } finally {await db.close();}
});
