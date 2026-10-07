import { test,expect } from '../../../manage-frontend/node_modules/vitest';
import { api } from '../../../taro-miniprogram/src/core/api';
import { setSession } from '../../../taro-miniprogram/src/core/session';
const enabled=process.env.WECHAT_FIXTURE==='1';
test.skipIf(!enabled)('小程序微信建号首次设密及本地密码登录',async()=>{
 const first:any=await api('/auth/wechat/callback','POST',{code:'fake-code'},false);expect(first.user.canSetCredentials).toBe(true);setSession(first);
 const second:any=await api('/auth/wechat/callback','POST',{code:'second-fake-code'},false);expect(second.user.id).toBe(first.user.id);
 const setup:any=await api('/me/setup-account','POST',{username:'go-wx-smoke',password:'wx-smoke-password'});expect(setup.user.canSetCredentials).toBe(false);setSession(setup);
 const login:any=await api('/auth/login','POST',{username:'go-wx-smoke',password:'wx-smoke-password'},false);expect(login.user.id).toBe(first.user.id);setSession(null);
});
