import { test,expect } from '../../../manage-frontend/node_modules/vitest';
import { api,refreshSession } from '../../../taro-miniprogram/src/core/api';
import { setSession,session } from '../../../taro-miniprogram/src/core/session';
test('小程序真实请求和会话层通过HTTP传输替身访问Go',async()=>{
 const auth:any=await api('/auth/login','POST',{username:process.env.SMOKE_USERNAME||'m6admin',password:process.env.SMOKE_PASSWORD||'m6-local-password'},false);setSession(auth);
 expect((await api<any>('/articles','GET',undefined,false)).list.length).toBeGreaterThan(0);
 setSession({...auth,accessToken:'invalid-token'},false);expect((await api<any>('/me/profile')).id).toBe(auth.user.id);
 await refreshSession();expect(session()?.accessToken).toBeTypeOf('string');
 const draft:any=await api('/articles','POST',{title:'小程序投稿验证',content:'# 投稿'});await api(`/articles/${draft.id}`,'PUT',{title:'小程序投稿更新',content:'# 更新'});await api(`/articles/${draft.id}`,'DELETE');
 expect(Array.isArray(await api('/categories/tree','GET',undefined,false))).toBe(true);expect((await api<any>('/me/notifications')).list).toBeInstanceOf(Array);
 await api('/auth/logout','POST');setSession(null);
});
