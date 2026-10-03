import fs from 'node:fs/promises';
const base=process.env.API_BASE_URL||'http://127.0.0.1:11002/api/v1';
if(!/^http:\/\/(127\.0\.0\.1|localhost):11002\/api\/v1$/.test(base))throw Error('This seed script only accepts the isolated local backend on port 11002');
async function api(path,method='GET',body,token){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json();if(j.code!==0)throw Error(path+': '+j.code+' '+j.message);return j.data;}
const admin=await api('/auth/login','POST',{username:'admin',password:'admin123456'});
let member;try{member=await api('/auth/register','POST',{username:'flutter_reader',password:'Reader123456',email:'flutter_reader@example.test',nickname:'全栈读者'});}catch{member=await api('/auth/login','POST',{username:'flutter_reader',password:'Reader123456'});}
const existing=await api('/articles');
if(!existing.list.length){
 const cats=[];const currentCats=await api('/categories');for(const [name,slug] of [['前端开发','frontend'],['后端工程','backend'],['工程实践','engineering']])cats.push(currentCats.find(c=>c.slug===slug)||await api('/categories','POST',{name,slug},admin.accessToken));
 const currentTags=await api('/tags');for(const [name,slug] of [['Flutter','flutter'],['TypeScript','typescript'],['工程化','engineering']])if(!currentTags.some(t=>t.slug===slug))await api('/tags','POST',{name,slug},admin.accessToken);
 const dir=new URL('../../articles/',import.meta.url);const files=(await fs.readdir(dir)).filter(f=>f.endsWith('.md')).sort().slice(0,24);
 for(let i=0;i<files.length;i++){let content=await fs.readFile(new URL(files[i],dir),'utf8');let title=content.match(/^#\s+(.+)$/m)?.[1]||files[i].replace(/\.md$/,'');content=content.replace(/^---[\s\S]*?---\s*/,'').slice(0,65535);await api('/articles','POST',{title:title.slice(0,200),summary:'从实践出发，理解技术背后的原理。一起构建完整的全栈知识体系。',content,status:'published',categoryId:cats[i%cats.length].id,tags:['工程化'],slug:'app-reading-'+(i+1)},admin.accessToken);}
 const sample=await api('/articles','POST',{title:'Flutter：从阅读到创作，让知识持续生长',summary:'一份关于组件、状态与工程实践的阅读指南。',slug:'flutter-guide',status:'published',categoryId:cats[0].id,tags:['Flutter'],content:'# 开始构建\n\n保持好奇，一次解决一个真实问题。\n\n## 重复标题\n\n第一段内容。\n\n```dart\n# 不是标题\nfinal message = "Hello Flutter";\n```\n\nSetext 标题\n---\n\n标准 Markdown 标题。\n\n## 重复标题\n\n第二段内容。\n\n| 层次 | 职责 |\n| --- | --- |\n| UI | 阅读体验 |\n| API | 数据与权限 |\n\n> 从一个可以验证的最小闭环开始。'},admin.accessToken);
 let parent;for(let i=0;i<24;i++){const c=await api(`/articles/${sample.id}/comments`,'POST',{content:i===0?'欢迎一起讨论 Flutter 的工程实践。':`第 ${i+1} 条交流：把阅读和实践结合起来，收获会更扎实。`,...(i&&i%3?{parentId:parent}: {})},member.accessToken);if(!i||i%3===0)parent=c.id;}
}
console.log('Local content ready. Member: flutter_reader / Reader123456');
