// Run only in the VM container. Never print connection strings or row data.
import { readFileSync } from 'node:fs';
import pg from '/tmp/ritmo-audit-tools/node_modules/pg/lib/index.js';
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:20000});
try{
 await client.connect();
 if(process.argv[2]==='apply'){
  await client.query(readFileSync('/tmp/pilot-rls.sql','utf8'));
  console.log('Incremental RLS migration committed.');
 }
 const {rows:tables}=await client.query("select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'health_%' and c.relkind='r' order by 1");
 const {rows:policies}=await client.query("select tablename,policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename like 'health_%' order by 1,2");
 console.log(JSON.stringify({tables,policies},null,2));
}catch(error){console.log(JSON.stringify({error:error.code||'DB_CONNECT_FAILED',message:error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]')}));process.exitCode=1;}
finally{await client.end();}
