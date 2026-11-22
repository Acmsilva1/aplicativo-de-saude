import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:pending,error}=await db.from('health_user_roles').select('user_id').eq('must_change_password',true);
if(error)throw Error('Could not inspect pending first-access accounts.');
const legacy=createHash('sha256').update('123456').digest('hex');
let legacyInitialPasswordAccounts=0;
for(const row of pending){
 const {data,error:authError}=await db.auth.admin.getUserById(row.user_id);
 if(authError)throw Error('Pending account lookup failed.');
 if(data.user?.app_metadata?.initial_password_digest===legacy)legacyInitialPasswordAccounts++;
}
console.log(JSON.stringify({pendingFirstAccessAccounts:pending.length,legacyInitialPasswordAccounts,maintenanceCredentialsAbsentFromRuntime:['DATABASE_URL','BOOTSTRAP_ADMIN_PASSWORD','BOOTSTRAP_ADMIN_EMAIL','BOOTSTRAP_ADMIN_NAME'].every(key=>!process.env[key])},null,2));
