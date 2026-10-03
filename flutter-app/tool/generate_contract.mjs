import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require = createRequire(new URL('../../node-backend/package.json', import.meta.url));
const YAML = require('yaml');
const root = fileURLToPath(new URL('../',import.meta.url));
const api=YAML.parse(fs.readFileSync(new URL('../../docs/api/openapi.v1.yaml',import.meta.url),'utf8'));
const names=['Article','ArticleSummary','User','Comment','CategoryNode','Tag','TocItem','Notification','Pagination','AuthResult'];
function field(s,k){
 const x=`json['${k}']`;
 if(s.$ref){const n=s.$ref.split('/').pop();return [`Api${n}?`,`${x} == null ? null : Api${n}.fromJson(Map<String,dynamic>.from(${x} as Map))`];}
 if(s.type==='array'){if(s.items.$ref){const n=s.items.$ref.split('/').pop();return [`List<Api${n}>`,`(${x} as List? ?? []).map((e)=>Api${n}.fromJson(Map<String,dynamic>.from(e as Map))).toList()`];}return ['List<String>',`(${x} as List? ?? []).map((e)=>e.toString()).toList()`];}
 if(s.type==='integer')return ['int?',`(${x} as num?)?.toInt()`];
 if(s.type==='boolean')return ['bool?',`${x} as bool?`];
 return ['String?',`${x} as String?`];
}
let out='// Generated from docs/api/openapi.v1.yaml. Run node tool/generate_contract.mjs.\n';
for(const name of names){out+=`\nclass Api${name} {\n  Api${name}.fromJson(Map<String,dynamic> value) : json = Map.unmodifiable(value);\n  final Map<String,dynamic> json;\n`;
 for(const [k,s]of Object.entries(api.components.schemas[name].properties)){const[t,e]=field(s,k);out+=`  ${t} get ${k} => ${e};\n`;}
 out+='}\n';}
fs.mkdirSync(root+'lib/core/generated',{recursive:true});fs.writeFileSync(root+'lib/core/generated/models.dart',out);
execFileSync('dart',['format',root+'lib/core/generated/models.dart']);
console.log('Generated '+names.length+' typed API models');
