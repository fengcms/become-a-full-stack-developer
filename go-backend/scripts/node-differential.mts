/** Replay Go's neutral HTTP trace against the frozen Node implementation.
 * Run from node-backend so its tsconfig aliases resolve. No production network.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { sql } from '../../node-backend/node_modules/drizzle-orm/index.js';
import { createApp } from '../../node-backend/src/app';
import { createLocalDb, setDb } from '../../node-backend/src/db/client';
import { migrate } from '../../node-backend/src/db/migrate';
import { signAccessToken,verifyAccessToken } from '../../node-backend/src/shared/auth';
import { readEnv } from '../../node-backend/src/config/env';

const tracePath = process.argv[2];
if (!tracePath) throw new Error('Trace path required');
const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'befull-node-diff-'));process.chdir(scratch);
const db = createLocalDb(process.env.NODE_FIXTURE_OUTPUT||':memory:'); setDb(db); await migrate(db);
const u = trace.seed.admin;
for(const user of trace.seed.users||[u])await db.run(sql`INSERT INTO users(id,username,password_hash,credentials_configured,role,status,level,created_at,updated_at)
 VALUES(${user.ID},${user.Username},${user.PasswordHash},1,${user.Role},'active',1,1000,1000)`);
const app = createApp(readEnv({JWT_SECRET:'s'.repeat(32),NODE_ENV:'test',STORAGE_DRIVER:'local',WECHAT_MINI_APP_ID:'test-app',WECHAT_MINI_APP_SECRET:'fake-secret'}));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
 const url=String(input);
 if (url.startsWith('https://api.weixin.qq.com/sns/jscode2session')) return Response.json({openid:'test-openid',session_key:'fake-session-key'});
 return originalFetch(input,init);
};
const RealDate=Date;let clockMillis=RealDate.now();
globalThis.Date=class extends RealDate{constructor(value?:any){super(value===undefined?clockMillis:value)}static now(){return clockMillis}} as any;
const actors: Record<string,string>={}; let comparisons=0; const differences:any[]=[];
for(const user of trace.seed.users||[])actors[user.Role]=await signAccessToken({sub:String(user.ID),role:user.Role},'s'.repeat(32));
 actors.invalid='invalid-token';
 let notificationSeeded=false;
const volatile=new Set(['requestId','timestamp','createdAt','updatedAt','publishedAt','lastReadAt','accessToken','refreshToken']);
function normalized(value:any):any {
 if(Array.isArray(value))return value.map(normalized);
 if(value && typeof value==='object') {
  const result:any={}; for(const [key,v] of Object.entries(value)) {
   if(volatile.has(key)){result[key]=v===null?null:'<generated>';continue;}
   if(key==='username'&&typeof v==='string'&&v.startsWith('wx_')){result[key]='<wechat-generated>';continue;}
   result[key]=normalized(v);
  }return result;
 }return value;
}
// Node currently does not generate publication notifications; this is a
// documented product gap, not permission to ignore arbitrary notification diffs.
function expectedNotificationGap(step:any,json:any):boolean {
 if (step.operation==='getUnreadNotificationCount')return json.data.count===1&&step.response.data.count===2;
 if (step.operation!=='listMyNotifications')return false;
 const go=normalized(step.response.data),node=normalized(json.data);
 const additions=go.list.filter((n:any)=>n.type==='article_published');
 if(additions.length!==1||additions[0].body!=='会员投稿'||additions[0].title!=='文章已发布'||additions[0].isRead!==false||additions[0].link!=='/articles/2')return false;
 try{assert.deepEqual({...go,list:go.list.filter((n:any)=>n.type!=='article_published'),pagination:{...go.pagination,total:go.pagination.total-1}},node);return true}catch{return false}
}
for(const step of trace.requests) {
 clockMillis=RealDate.parse(step.response.timestamp);if(["createArticle","createComment","uploadFile"].includes(step.operation)&&step.response.data?.createdAt)clockMillis=RealDate.parse(step.response.data.createdAt);
 if(step.operation==='listMyNotifications'&&step.status===200&&!notificationSeeded){
  const systems=step.response.data.list.filter((n:any)=>n.type==='system');
  for(const n of systems)await db.run(sql`INSERT INTO notifications(id,user_id,type,title,is_read,created_at) VALUES(${n.id},${n.userId},'system',${n.title},0,1000)`);
  notificationSeeded=true;
 }
 const headers:any={};if(actors[step.actor])headers.Authorization=`Bearer ${actors[step.actor]}`;
 let body:any;
 if(step.body?._multipart){const form=new FormData();form.append('file',new File([step.body.content],step.body.name,{type:step.body.mime}));body=form;}
 else if(step.body!==null&&! ["GET","HEAD"].includes(step.method)){headers['Content-Type']='application/json';body=JSON.stringify(step.body);}
 // Refresh uses the token produced by Node rather than the Go random token.
 if(step.operation==='refreshToken'){headers['Content-Type']='application/json';body=JSON.stringify({refreshToken:actors['memberRefresh']});}
 if(step.response.data?.accessToken){const claims=await verifyAccessToken(step.response.data.accessToken,'s'.repeat(32));assert.equal(claims.sub,String(step.response.data.user.id));assert.equal(claims.role,step.response.data.user.role);}
 const res=await app.request(step.path,{method:step.method,headers,body});const json:any=await res.json();
 if(step.operation==='login'&&!step.actor){if(step.body.username===u.Username)actors.admin=json.data?.accessToken;}
 if(step.operation==='registerUser'){actors.member=json.data?.accessToken;actors.memberRefresh=json.data?.refreshToken;}
 if(step.operation==='oauthCallback'||step.operation==='setupAccount')actors.wechat=json.data?.accessToken;
 if(step.operation==='refreshToken')actors.member=json.data?.accessToken;
 try {assert.equal(res.status,step.status);assert.deepEqual(normalized(json),normalized(step.response));comparisons++;}
 catch(error){if(res.status===200&&json.code===0&&expectedNotificationGap(step,json)){differences.push({operation:step.operation,reason:'Node缺少发布通知生成，Go按产品事件实现',node:normalized(json.data),go:normalized(step.response.data)});}
 else{differences.push({operation:step.operation,unexpected:true,nodeStatus:res.status,goStatus:step.status,node:normalized(json),go:normalized(step.response)});}}
}
globalThis.fetch=originalFetch;globalThis.Date=RealDate;fs.rmSync(scratch,{recursive:true,force:true});
const report={requests:trace.requests.length,comparisons,operations:new Set(trace.requests.map((s:any)=>s.operation)).size,expectedDifferences:differences.filter(d=>!d.unexpected),unexpectedDifferences:differences.filter(d=>d.unexpected)};
const reportPath=process.argv[3]||'/tmp/befull-m6-differential.json';fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({requests:report.requests,operations:report.operations,comparisons,expectedDifferences:report.expectedDifferences.length,unexpectedDifferences:report.unexpectedDifferences.length,report:reportPath}));
if(report.unexpectedDifferences.length)process.exitCode=1;
