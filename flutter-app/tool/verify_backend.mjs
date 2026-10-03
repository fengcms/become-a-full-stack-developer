import assert from 'node:assert/strict';
const base='http://127.0.0.1:11002/api/v1';
async function call(path,method='GET',body,token){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return r.json();}
const member=(await call('/auth/login','POST',{username:'flutter_reader',password:'Reader123456'})).data;
const rotated=(await call('/auth/refresh','POST',{refreshToken:member.refreshToken})).data;
assert.notEqual(rotated.refreshToken,member.refreshToken);
assert.equal((await call('/auth/refresh','POST',{refreshToken:member.refreshToken})).code,1003);
assert.equal((await call('/auth/refresh','POST',{refreshToken:rotated.refreshToken})).code,1003);
console.log('PASS refresh rotation, replay rejection, family invalidation');
const auth=(await call('/auth/login','POST',{username:'flutter_reader',password:'Reader123456'})).data;
const admin=(await call('/auth/login','POST',{username:'admin',password:'admin123456'})).data;
const ids=[];
try{
 for(const desired of ['draft','pending',undefined]){
  const draft=(await call('/articles','POST',{title:'APP 状态验证 '+Date.now(),content:'## 标题\n\n正文',...(desired?{status:desired}:{})},auth.accessToken)).data;ids.push(draft.id);assert.equal(draft.status,desired??'draft');
  assert.equal((await call(`/articles/${draft.id}`)).code,3001);
  assert.equal((await call(`/articles/${draft.id}`,'GET',undefined,auth.accessToken)).code,0);
  const updated=(await call(`/articles/${draft.id}`,'PUT',{title:'已修改'},auth.accessToken)).data;assert.equal(updated.status,desired??'draft');
  assert.equal((await call(`/articles/${draft.id}/toc`,'GET',undefined,auth.accessToken)).code,3001);
 }
 await call(`/articles/${ids[0]}/submit`,'POST',{},auth.accessToken);
 await call(`/admin/articles/${ids[0]}/approve`,'POST',{},admin.accessToken);
 // Contract state transition route is checked separately before asserting member edit.
 const publicState=(await call(`/articles/${ids[0]}`,'GET',undefined,auth.accessToken)).data;
 assert.equal(publicState.status,'published');assert.equal((await call(`/articles/${ids[0]}`,'PUT',{summary:'再次编辑'},auth.accessToken)).data.status,'pending');
 const a=(await call('/articles/flutter-guide')).data;
 const toc=(await call(`/articles/${a.id}/toc`)).data;
 assert.deepEqual(toc.map(t=>t.text),['开始构建','重复标题','重复标题']);assert.notEqual(toc[1].anchor,toc[2].anchor);
 console.log('PASS explicit draft/pending, omitted default draft, updates, private preview, unpublished toc 404');
 console.log('PASS server TOC order, repeated anchors, fenced code exclusion; Setext intentionally absent');
 const comments=(await call(`/articles/${a.id}/comments?pageSize=20`)).data;assert.ok(comments.pagination.total>20);
 await call('/me/favorites','POST',{articleId:a.id},auth.accessToken);
 assert.ok((await call('/me/favorites','GET',undefined,auth.accessToken)).data.list.some(x=>x.id===a.id));
 await call(`/me/favorites/${a.id}`,'DELETE',undefined,auth.accessToken);
 await call('/me/history','POST',{articleId:a.id,progress:42},auth.accessToken);
 assert.equal((await call('/me/history','GET',undefined,auth.accessToken)).data.list[0].progress,42);
 console.log('PASS comments pagination, favorites, reading progress');
}finally{for(const id of ids)await call(`/articles/${id}`,'DELETE',undefined,auth.accessToken);}
