/** Native HTTP adapter for the unchanged Node backend, isolated benchmark DB. */
import fs from 'node:fs';
import { serve } from '../../node-backend/node_modules/@hono/node-server/dist/index.mjs';
import { createApp } from '../../node-backend/src/app';
import { createLocalDb,setDb } from '../../node-backend/src/db/client';
import { readEnv } from '../../node-backend/src/config/env';
const env=readEnv({...process.env,NODE_ENV:'test'});const db=createLocalDb(env.DB_FILE);setDb(db);
let queries=0,errors=0,totalMs=0,maxMs=0;
const client:any=(db as any).$client;const prepare=client.prepare.bind(client);client.prepare=(query:string)=>{const stmt=prepare(query);for(const method of ["run","all","get"]){const original=stmt[method].bind(stmt);stmt[method]=(...args:any[])=>{const start=performance.now();queries++;try{return original(...args)}catch(error){errors++;throw error}finally{const ms=performance.now()-start;totalMs+=ms;maxMs=Math.max(maxMs,ms)}}}return stmt};
process.on("SIGTERM",()=>{if(process.env.DB_METRICS_FILE)fs.writeFileSync(process.env.DB_METRICS_FILE,JSON.stringify({queries,errors,totalMs,maxMs},null,2));process.exit(0)});
serve({fetch:createApp(env).fetch,port:Number(env.PORT),hostname:'127.0.0.1'});
console.log('Node benchmark HTTP server ready');
