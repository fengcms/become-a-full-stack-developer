import { expect } from '../../../manage-frontend/node_modules/vitest';
export async function browserFlow(request:any,store:any){
 const fetchOriginal=globalThis.fetch;let cookie='';
 globalThis.fetch=async(input:any,options:any={})=>{
  const headers=new Headers(options.headers);if(cookie)headers.set('Cookie',cookie);
  const url=new URL(String(input),process.env.GO_BASE_URL||'http://127.0.0.1:8080');
  const r=await fetchOriginal(url,{...options,headers});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return r;
 };
 try{
  const auth=await request('/auth/login',{method:'POST',skipAuth:true,body:{username:process.env.SMOKE_USERNAME||'m6admin',password:process.env.SMOKE_PASSWORD||'m6-local-password'}});store.getState().setSession(auth);
  const list=await request('/articles',{skipAuth:true});expect(list.list.length).toBeGreaterThan(0);const id=list.list[0].id;
  expect((await request(`/articles/${id}`,{skipAuth:true})).content).toBeTypeOf('string');
  expect((await request('/search',{query:{q:'Go'}})).articles.list.length).toBeGreaterThan(0);
  expect(Array.isArray(await request('/categories/tree'))).toBe(true);
  expect((await request('/site/settings')).siteName).toBeTypeOf('string');
  // Invalid access token drives the real adapter's silent refresh and replay.
  store.setState({accessToken:'invalid-token'});expect((await request('/me/profile')).username).toBe(auth.user.username);
  expect((await request(`/articles/${id}/like`,{method:'POST'})).liked).toBe(true);
  expect((await request(`/articles/${id}/like`,{method:'DELETE'})).liked).toBe(false);
  await request('/me/favorites',{method:'POST',body:{articleId:id}});expect((await request('/me/favorites')).list.length).toBeGreaterThan(0);await request(`/me/favorites/${id}`,{method:'DELETE'});
  await request('/me/history',{method:'POST',body:{articleId:id,progress:0}});expect((await request('/me/history')).list[0].progress).toBe(0);
  const draft=await request('/articles',{method:'POST',body:{title:'客户端协议验证',content:'# 投稿'}});
  await request(`/articles/${draft.id}`,{method:'PUT',body:{title:'客户端协议验证更新',content:'# 更新'}});
  const form=new FormData();form.append('file',new File(['<svg/>'],'smoke.svg',{type:'image/svg+xml'}));const upload=await request('/upload',{method:'POST',body:form});expect(upload.url).toMatch(/^\/files\//);
  await request(`/attachments/${upload.id}`,{method:'DELETE'});await request(`/articles/${draft.id}`,{method:'DELETE'});
  const comment=await request(`/articles/${id}/comments`,{method:'POST',body:{content:'客户端真实请求层兼容验证'}});const reply=await request(`/articles/${id}/comments`,{method:'POST',body:{content:'回复验证',parentId:comment.id}});expect(reply.parentId).toBe(comment.id);await request(`/comments/${comment.id}`,{method:'DELETE'});
  expect((await request('/me/notifications')).list).toBeInstanceOf(Array);await request('/auth/logout',{method:'POST'});
 }finally{globalThis.fetch=fetchOriginal;store.getState().clear()}
}
