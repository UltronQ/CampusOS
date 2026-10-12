import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEMO_ACCOUNTS } from '../../src/tests/fixtures/demoData.js';
import { demoEnvironment, publicDemoConfig, demoPassword } from './environment.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
/** Admin-only Node tooling, never imported by the application bundle. */
export async function provisionDemoAccounts({admin,db,env}) {
  const users=[];
  for(let page=1;page<=100;page++) {
    const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
    if(error)throw fail('AUTH_ADMIN','Could not list demo Auth identities.');
    users.push(...data.users);
    if(data.users.length<1000)break;
    if(page===100)throw fail('AUTH_LIMIT','Auth directory exceeds the provisioning lookup limit.');
  }
  const accounts=[];
  for(const account of DEMO_ACCOUNTS) {
    let user=users.find((u)=>u.email?.toLowerCase()===account.email);
    if(!user) {
      const password=demoPassword(account,env);
      if(!password||password.length<12)throw fail('MISSING_PASSWORD','Set a local demo password of at least 12 characters before provisioning.');
      const {data,error}=await admin.auth.admin.createUser({email:account.email,password,email_confirm:true,user_metadata:{campusos_demo:true}});
      if(error||!data.user)throw fail('AUTH_CREATE','Demo Auth user could not be created.');
      user=data.user;
    }
    accounts.push({...account,user_id:user.id});
  }
  await db.query('BEGIN');
  try {
    for(const account of accounts) {
      // The matching Auth identity must exist in this PostgreSQL project.
      const auth=await db.query('SELECT id FROM auth.users WHERE id=$1',[account.user_id]);
      if(!auth.rows.length)throw fail('PROJECT_MISMATCH','Auth and PostgreSQL connections do not refer to the same project.');
      await db.query('INSERT INTO public.profiles(id,role) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING',[account.user_id,account.role]);
      const existing=await db.query('SELECT role::text AS role FROM public.profiles WHERE id=$1',[account.user_id]);
      if(existing.rows[0].role!==account.role)throw fail('ROLE_CONFLICT','Existing account role does not match the demo manifest; it was not overwritten.');
    }
    await db.query('COMMIT');
  } catch(error){await db.query('ROLLBACK');throw error;}
  return accounts;
}
export async function linkDemoStudents(db,accounts) {
  await db.query('BEGIN');
  try {
    for(const account of accounts.filter((a)=>a.student_id)) {
      const result=await db.query('UPDATE public.students SET user_id=$1 WHERE id=$2 AND (user_id IS NULL OR user_id=$1) RETURNING id',[account.user_id,account.student_id]);
      if(result.rows.length!==1)throw fail('LINK_CONFLICT','A demo student is missing or linked to another Auth identity; the link was not overwritten.');
    }
    await db.query('COMMIT');
  } catch(error){await db.query('ROLLBACK');throw error;}
}
export async function runDemoProvisioning() {
  const env=await demoEnvironment(),config=publicDemoConfig(env);
  if(!config.configured)throw fail('CONFIGURATION','Configure the real public Supabase project values in .env.local first.');
  if(!env.SUPABASE_SERVICE_ROLE_KEY||!env.CAMPUSOS_SEED_DATABASE_URL)throw fail('ADMIN_CONFIGURATION','Set SUPABASE_SERVICE_ROLE_KEY and CAMPUSOS_SEED_DATABASE_URL in ignored .env.seed.local (server tooling only).');
  const db=new Client({connectionString:env.CAMPUSOS_SEED_DATABASE_URL,connectionTimeoutMillis:15000});
  const admin=createClient(config.url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  await db.connect();
  try {
    const accounts=await provisionDemoAccounts({admin,db,env});
    const sql=await readFile(new URL('../../supabase/seed/demo.seed.sql',import.meta.url),'utf8');
    await db.query(sql);
    await linkDemoStudents(db,accounts);
    console.log('Demo seed completed: 30 fixture students, 5 drives and 4 provisioned demo accounts. Existing passwords/roles/links were not overwritten.');
  } finally {await db.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try {await runDemoProvisioning();}
  catch(error){console.error('Demo provisioning failed ('+(error.code??'ERROR')+'): '+(String(error.code??'').match(/^[A-Z_]+$/)?error.message:'Check project migrations, local server settings and database-owner privileges.'));process.exitCode=1;}
}
