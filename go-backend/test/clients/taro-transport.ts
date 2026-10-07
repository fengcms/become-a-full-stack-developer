// Only the platform transport/storage is replaced; the application's api,
// session, epoch and cache implementation are exercised unchanged.
const memory=new Map<string,unknown>();
export default {
 async request(options:any){const r=await fetch(options.url,{method:options.method,headers:options.header,body:options.method==='GET'?undefined:JSON.stringify(options.data)});return{statusCode:r.status,data:await r.json()};},
 getStorageSync:(k:string)=>memory.get(k),setStorageSync:(k:string,v:unknown)=>memory.set(k,v),removeStorageSync:(k:string)=>memory.delete(k),showToast:()=>{},
};
