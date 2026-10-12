import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { demoData, DEMO_TIMESTAMP } from '../../src/tests/fixtures/demoData.js';

const quote=(v)=>v===null||v===undefined?'NULL':typeof v==='number'||typeof v==='boolean'?String(v):Array.isArray(v)?'ARRAY['+v.map(quote).join(',')+']::text[]':"'"+String(v).replaceAll("'","''")+"'";
function insert(table,rows) {
  if(!rows.length)return '';
  const columns=Object.keys(rows[0]);
  const values=rows.map((row)=>'  ('+columns.map((key)=>{
    if(key==='approved_by'||key==='updated_by')return row[key]?'current_setting(\'campusos.demo_actor\')::uuid':'NULL';
    const value=row[key];if(Array.isArray(value)&&key==='department_ids')return 'ARRAY['+value.map(quote).join(',')+']::uuid[]';
    if(Array.isArray(value)&&['graduation_years','eligible_graduation_years'].includes(key))return 'ARRAY['+value.map(quote).join(',')+']::integer[]';
    return quote(value);
  }).join(',')+')').join(',\n');
  return `INSERT INTO public.${table} (${columns.join(',')}) VALUES\n${values}\nON CONFLICT DO NOTHING;\n`;
}
export function generateDemoSeedSql() {
  const data=demoData();
  let sql=`-- M3-5 deterministic demonstration dataset: 3 departments, 30 students, 5 drives.
-- Run after all migrations as the trusted table owner on a development project.
-- Provision a real placement_incharge profile first. This file creates no Auth users/roles.
-- Existing records are never overwritten; exact expected counts assume an otherwise empty demo project.
BEGIN;
DO $$ DECLARE actor uuid; BEGIN
  SELECT id INTO actor FROM public.profiles WHERE role='placement_incharge' ORDER BY id LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'Provision a real in-charge Auth user/profile before demo seeding.' USING ERRCODE='42501'; END IF;
  PERFORM set_config('campusos.demo_actor',actor::text,true);
END $$;
CREATE TEMP TABLE campusos_demo_guard_state ON COMMIT DROP AS
SELECT tgrelid,tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN
  ('public.drives'::regclass,'public.applications'::regclass,'public.offers'::regclass,
   'public.clearance_items'::regclass,'public.student_clearances'::regclass,
   'public.recruitment_stages'::regclass,'public.application_stage_results'::regclass)
  AND tgname IN ('guard_drive','guard_application','guard_offer','guard_clearance_item','guard_student_clearance','guard_stage','guard_stage_result');
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT * FROM campusos_demo_guard_state LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I',item.tgrelid::regclass,item.tgname);
  END LOOP;
END $$;
`;
  for(const key of ['departments','companies','students','drives','drive_departments','recruitment_stages','applications','application_stage_results','offers','clearance_items'])sql+='\n'+insert(key,data[key]);
  const decisions=data.student_clearances.map((r)=>({...r,approved_by:r.approved_at?'actor':null,updated_by:'actor',updated_at:DEMO_TIMESTAMP}));
  sql+='\n'+insert('student_clearances',decisions);
  sql+=`
DO $$ DECLARE item record; mode text; BEGIN
  FOR item IN SELECT * FROM campusos_demo_guard_state LOOP
    mode:=CASE item.tgenabled WHEN 'O' THEN 'ENABLE' WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' END;
    EXECUTE format('ALTER TABLE %s %s TRIGGER %I',item.tgrelid::regclass,mode,item.tgname);
  END LOOP;
END $$;
COMMIT;
`;
  return sql;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  await writeFile(new URL('../../supabase/seed/demo.seed.sql',import.meta.url),generateDemoSeedSql());
  console.log('Generated deterministic 30-student demo SQL; no database was modified.');
}
