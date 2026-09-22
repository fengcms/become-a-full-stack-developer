"""Seed only the independent loopback test backend; never targets production."""
import json,urllib.request,urllib.error
BASE='http://127.0.0.1:11001/api/v1'
token=''
def api(path,method='GET',body=None):
 headers={'Content-Type':'application/json'}
 if token: headers['Authorization']='Bearer '+token
 req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=20) as response: result=json.load(response)
 except urllib.error.HTTPError as e:
  raise RuntimeError(str(e.code)+' '+e.read().decode()) from e
 assert result['code']==0,result
 return result.get('data')
token=api('/auth/login','POST',{'username':'admin','password':'admin123456'})['accessToken']
if api('/articles?pageSize=1')['pagination']['total']:
 print('Preview data already exists; no duplicate writes.');raise SystemExit
api('/admin/site/settings','PATCH',{'siteName':'成为全栈开发工程师','siteTitle':'成为全栈开发工程师 · 从实践中学习','siteDescription':'用一个真实可运行的文章系统，串起产品、前端、后端与部署。','copyright':'© 2026 FungLeo · 成为全栈开发工程师'})
front=api('/categories','POST',{'name':'前端开发','slug':'frontend','description':'从页面布局到应用架构，记录前端开发中的每一步。','sortOrder':1})
react=api('/categories','POST',{'name':'React','slug':'react','parentId':front['id']})
practice=api('/categories','POST',{'name':'工程实践','slug':'react-practice','parentId':react['id']})
api('/categories','POST',{'name':'组件设计','slug':'components','parentId':practice['id']})
back=api('/categories','POST',{'name':'后端技术','slug':'backend','description':'设计数据模型，构建清晰稳定的接口服务。','sortOrder':2})
eng=api('/categories','POST',{'name':'工程实践','slug':'engineering','description':'测试、构建与发布，让代码成为完整的作品。','sortOrder':3})
for name,slug in [('React','react'),('Node.js','nodejs'),('API 设计','api'),('TypeScript','typescript'),('工程化','engineering')]:api('/tags','POST',{'name':name,'slug':slug})
titles=['契约先行：设计一套被多个端复用的 API','把复杂表单拆成清楚、可维护的组件','从本地运行到正式上线，还差哪些步骤？','React 状态管理：哪些数据应该放在哪里','让文章分类真正成为内容导航','从需求出发，画出系统的边界','理解服务端渲染与客户端交互','一张表如何支撑清晰的权限模型','从数据结构开始设计评论系统','让错误提示真正帮助使用者','第一次部署之前的检查清单','用测试保护关键业务规则','给内容系统设计合理的缓存','多级栏目导航的交互细节','把 Markdown 变成舒适的阅读体验','让搜索从能用走向好用','收藏与阅读历史的数据边界','一次登录背后的会话管理','TypeScript 如何帮助前后端协作','项目目录不是越复杂越好','可靠的分页与列表加载','一篇文章的发布流程','从可访问性检查页面质量','从一个真实项目连接全栈知识']
content='''## 为什么先明确边界

开发一个完整的系统，需要把页面、接口和数据连接起来。先明确每个模块承担的责任，再选择合适的实现方式。

> 让约定可以被检查，让结果可以被验证。

## 统一请求与响应

以文章列表为例，页面需要文章摘要，也需要分页信息。

```typescript
const response = await fetch('/api/v1/articles?page=1')
const { data } = await response.json()
```

| 字段 | 作用 |
| --- | --- |
| list | 当前页内容 |
| pagination | 分页信息 |

### 用同一套规则处理异常

网络故障和空列表是不同的状态，应该有不同的展示方式。

## 从约定到落地

- 使用明确的数据结构。
- 对关键路径进行验证。
- 在真实设备上检查阅读体验。

## 从约定到落地

重复标题也需要独立的目录锚点，方便读者定位。
'''
for i,title in enumerate(titles):
 cat=[back,react,eng,practice][i%4]
 body={'title':title,'slug':'practice-'+str(i+1),'summary':'从真实项目出发，梳理设计与实现中的关键选择。把约定落到代码里，让系统清晰、可维护。','content':content,'categoryId':cat['id'],'tags':[['Node.js','API 设计'],['React','TypeScript'],['工程化']][i%3],'status':'published'}
 if i%3!=2:body['coverImage']='http://127.0.0.1:13001/covers/'+['api','react','deploy','data'][i%4]+'.svg'
 article=api('/articles','POST',body)
 if i==0:api('/articles/'+str(article['id'])+'/comments','POST',{'content':'先把契约定义好，确实能省下很多沟通成本。'})
print('Independent preview seeded: 24 articles, four-level categories, tags and a comment.')
