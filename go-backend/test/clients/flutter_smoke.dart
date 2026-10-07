import 'package:flutter_test/flutter_test.dart';
import 'package:fullstack_reader/core/network/api_client.dart';

class MemoryVault implements TokenVault {
  String? token;
  @override Future<String?> read() async => token;
  @override Future<void> write(String? value) async { token=value; }
}
void main(){
 test('Flutter真实Dio请求层兼容Go并完成刷新重放',()async{
  final client=ApiClient(baseUrl:'${const String.fromEnvironment('GO_BASE_URL',defaultValue:'http://127.0.0.1:8080')}/api/v1',vault:MemoryVault());
  try {
   final auth=await client.request('/auth/login',method:'POST',anonymous:true,data:{'username':const String.fromEnvironment('SMOKE_USERNAME',defaultValue:'m6admin'),'password':const String.fromEnvironment('SMOKE_PASSWORD',defaultValue:'m6-local-password')});await client.install(Map<String,dynamic>.from(auth));
   final articles=await client.request('/articles',anonymous:true);expect(articles['list'],isNotEmpty);final id=articles['list'][0]['id'];
   expect((await client.request('/articles/$id',anonymous:true))['content'],isA<String>());
   client.accessToken='invalid-token';expect((await client.request('/me/profile'))['id'],auth['user']['id']);
   await client.refresh();expect(client.accessToken,isNotEmpty);
   expect((await client.request('/articles/$id/like',method:'POST'))['liked'],isTrue);await client.request('/articles/$id/like',method:'DELETE');
   await client.request('/me/history',method:'POST',data:{'articleId':id,'progress':0});expect((await client.request('/me/history'))['list'][0]['progress'],0);
   final draft=await client.request('/articles',method:'POST',data:{'title':'Flutter投稿验证','content':'# 内容'});await client.request('/articles/${draft['id']}',method:'PUT',data:{'title':'Flutter投稿更新','content':'# 更新'});await client.request('/articles/${draft['id']}',method:'DELETE');
   expect(await client.request('/categories/tree',anonymous:true),isA<List>());expect((await client.request('/me/notifications'))['list'],isA<List>());
   await client.request('/auth/logout',method:'POST');
  } finally {client.dio.close(force:true);}
 },timeout:const Timeout(Duration(seconds:40)));
}
