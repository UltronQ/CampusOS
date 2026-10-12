import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAuthSessionService } from '../../src/services/authSessionService.js';
import { DEMO_ACCOUNTS } from '../../src/tests/fixtures/demoData.js';
import { demoEnvironment, publicDemoConfig, demoPassword } from './environment.js';

/** Every manifest account is checked; blocked checks are never represented as passing logins. */
export async function checkDemoLogins({env,makeClient=(url,key)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})}) {
  const config=publicDemoConfig(env),results=[];
  for(const account of DEMO_ACCOUNTS) {
    const password=demoPassword(account,env);
    if(!config.configured||!password){results.push({account:account.slug,email:account.email,expected_role:account.role,status:'blocked',reason:!config.configured?'Public project configuration is missing.':'Local demo password is missing; real login was not attempted.'});continue;}
    const client=makeClient(config.url,config.key),service=createAuthSessionService(()=>client);
    try {
      const login=await service.signInWithPassword(account.email,password);
      if(login.role!==account.role)throw new Error('role');
      const restored=await service.getRoleSession();
      if(restored.role!==account.role || restored.session.user.id!==login.session.user.id || (account.student_id&&restored.student?.id!==account.student_id))throw new Error('session');
      await service.signOut();
      if(await service.getSession()!==null)throw new Error('logout');
      const invalid=await client.auth.signInWithPassword({email:account.email,password:password+'-invalid'});
      if(!invalid.error||invalid.data?.session)throw new Error('invalid password accepted');
      results.push({account:account.slug,email:account.email,expected_role:account.role,status:'passed',checks:['password login','verified session restore','expected profile role','own student linkage','logout','invalid password rejection']});
    } catch {results.push({account:account.slug,email:account.email,expected_role:account.role,status:'failed',reason:'Real login, profile, session, student link or logout verification failed. Check locally provisioned credentials and migrations.'});}
    finally {await client.auth.signOut().catch(()=>{});}
  }
  return {checked_at:new Date().toISOString(),mode:'hosted Supabase Auth',passed:results.filter((r)=>r.status==='passed').length,failed:results.filter((r)=>r.status==='failed').length,blocked:results.filter((r)=>r.status==='blocked').length,results};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const output=await checkDemoLogins({env:await demoEnvironment()});
  await mkdir(new URL('../../docs/test-results/',import.meta.url),{recursive:true});
  await writeFile(new URL('../../docs/test-results/m3-5-hosted-logins.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
  console.log('Hosted demo logins: '+output.passed+' passed, '+output.failed+' failed, '+output.blocked+' blocked. No passwords or tokens were recorded.');
  process.exitCode=output.failed?1:output.blocked?2:0;
}
