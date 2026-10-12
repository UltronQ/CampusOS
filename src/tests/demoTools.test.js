import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { demoData,DEMO_ACCOUNTS } from './fixtures/demoData.js';
import { generateDemoSeedSql } from '../../scripts/demo/generateDemoSeed.js';
import { checkDemoLogins } from '../../scripts/demo/checkDemoLogins.js';

test('fixture generation is deterministic and generated SQL stays synchronized',async()=>{
  assert.deepEqual(demoData(),demoData());assert.equal(demoData().students.length,30);assert.equal(demoData().drives.length,5);
  assert.equal(await readFile(new URL('../../supabase/seed/demo.seed.sql',import.meta.url),'utf8'),generateDemoSeedSql());
  assert.equal(new Set(demoData().students.map((s)=>s.student_number)).size,30);
});
test('all four real-login checks report blocked without credentials and never contact Auth or print secrets',async()=>{
  const result=await checkDemoLogins({env:{},makeClient:()=>assert.fail('Blocked login contacted Auth')});
  assert.equal(result.blocked,4);assert.equal(result.passed,0);assert.deepEqual(result.results.map((r)=>r.email),DEMO_ACCOUNTS.map((a)=>a.email));
});
test('test-only Auth transport exercises every account, session restore, logout and invalid credentials',async()=>{
  const verified=new Set();let invalid=0;
  const result=await checkDemoLogins({env:{VITE_SUPABASE_URL:'https://demo-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'public-test',CAMPUSOS_DEMO_PASSWORD:'test-only-password-not-a-demo-default'},makeClient:()=>{
    let account=null,session=null;
    return {auth:{
      signInWithPassword:async({email,password})=>{
        if(password.endsWith('-invalid')){invalid++;return{data:{session:null},error:new Error('invalid')};}
        account=DEMO_ACCOUNTS.find((a)=>a.email===email);session={user:{id:'test-'+account.slug}};return{data:{session},error:null};
      },getSession:async()=>({data:{session},error:null}),getUser:async()=>{verified.add(account.slug);return{data:{user:session?.user},error:null};},signOut:async()=>{session=null;return{error:null};},
    },from:(table)=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='profiles'?{id:'test-'+account.slug,role:account.role}:{id:account.student_id},error:null})})})})};
  }});
  assert.equal(result.passed,4);assert.equal(result.blocked,0);assert.equal(verified.size,4);assert.equal(invalid,4);
  assert.doesNotMatch(JSON.stringify(result),/test-only-password|access_token|refresh_token/);
});
