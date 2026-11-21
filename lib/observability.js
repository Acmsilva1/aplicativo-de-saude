const buckets=new Map();
let total=0,errors=0,totalMs=0,peak=0;
export function observeApp(req,res,next){
 if(!req.path.startsWith('/api/')||req.query.resource==='observability')return next();
 const start=performance.now();
 res.once('finish',()=>{
  const minute=new Date().toISOString().slice(0,16);
  const bucket=buckets.get(minute)||{minute,requests:0,errors:0};
  bucket.requests++;total++;totalMs+=performance.now()-start;
  if(res.statusCode>=400){bucket.errors++;errors++;}
  buckets.set(minute,bucket);peak=Math.max(peak,bucket.requests);
  for(const key of buckets.keys())if(Date.now()-Date.parse(key+':00Z')>3600000)buckets.delete(key);
 });next();
}
export function appMetrics(){return {total_requests:total,errors,peak_requests_per_minute:peak,avg_response_ms:total?Math.round(totalMs/total*100)/100:0,memory_mb:Math.round(process.memoryUsage().rss/1024/1024),uptime_seconds:Math.floor(process.uptime()),buckets:[...buckets.values()],scope:'API local · métricas em memória desde o último reinício'};}
