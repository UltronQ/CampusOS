import { readFile } from 'node:fs/promises';
import { readSupabaseConfig } from '../../src/lib/supabaseConfig.js';
export async function demoEnvironment() {
  const values={};
  for(const filename of ['.env.local','.env.seed.local']) {
    try {
      const content=await readFile(new URL('../../'+filename,import.meta.url),'utf8');
      for(const line of content.split(/\r?\n/)) {
        const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
        if(match)values[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
      }
    } catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return {...values,...process.env};
}
export const publicDemoConfig=(env)=>readSupabaseConfig(env);
export const demoPassword=(account,env)=>env['CAMPUSOS_DEMO_PASSWORD_'+account.slug.replaceAll('-','_').toUpperCase()]||env.CAMPUSOS_DEMO_PASSWORD;
