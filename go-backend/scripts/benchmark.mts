// Run both real HTTP servers against separate copies of the same SQLite fixture.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const output=process.argv[2]||'/tmp/befull-m6-performance.json';
const cases=[{name:'列表',path:'/articles',n:50,c:8},{name:'详情',path:'/articles/1',n:50,c:8},{name:'搜索',path:'/search?q=Go&pageSize=20',n:50,c:8},{name:'登录 bcrypt12',path:'/auth/login',n:8,c:2},{name:'点赞与取消',path:'/articles/1/like',n:30,c:4}];
const report:any={machine:execFileSync('uname',['-m']).toString().trim(),fixtureArticles:500,clock:'performance.now',results:[]};
for(const [name,base,pid] of [['Go','http://127.0.0.1:18081',process.env.GO_BENCH_PID],['Node','http://127.0.0.1:18082',process.env.NODE_BENCH_PID]]){
 const auth=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'bench-admin',password:'bench-password'})}).then(r=>r.json());
 if(auth.code!==0)throw new Error('benchmark fixture login failed');const token=auth.data.accessToken;
 for(const scenario of cases){
  let errors=0;const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
  const perform=async()=>{let r:Response;
   if(scenario.name==='登录 bcrypt12')r=await fetch(base+'/api/v1'+scenario.path,{method:'POST',headers,body:JSON.stringify({username:'bench-admin',password:'bench-password'})});
   else if(scenario.name==='点赞与取消'){r=await fetch(base+'/api/v1'+scenario.path,{method:'POST',headers});if(!r.ok)errors++;await r.arrayBuffer();r=await fetch(base+'/api/v1'+scenario.path,{method:'DELETE',headers})}
   else r=await fetch(base+'/api/v1'+scenario.path,{headers});
   if(!r.ok)errors++;const body:any=await r.json();if(body.code!==0)errors++;
  };
  for(let i=0;i<5;i++)await perform();errors=0;
  const before=pid?execFileSync('ps',['-o','time=,rss=','-p',String(pid)]).toString().trim():'';
  const samples:number[]=[];let next=0;const started=performance.now();
  await Promise.all(Array.from({length:scenario.c},async()=>{while(next++<scenario.n){const t=performance.now();await perform();samples.push(performance.now()-t)}}));
  const elapsed=performance.now()-started;samples.sort((a,b)=>a-b);const percentile=(p:number)=>Number(samples[Math.min(samples.length-1,Math.ceil(samples.length*p)-1)].toFixed(2));
  const after=pid?execFileSync('ps',['-o','time=,rss=','-p',String(pid)]).toString().trim():'';
  report.results.push({implementation:name,scenario:scenario.name,samples:samples.length,concurrency:scenario.c,elapsedMs:Number(elapsed.toFixed(2)),operationsPerSecond:Number((scenario.n/(elapsed/1000)).toFixed(2)),p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),errors,cpuTimeAndRssBefore:before,cpuTimeAndRssAfter:after});
 }
}
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(report.results.some((r:any)=>r.errors))process.exitCode=1;
