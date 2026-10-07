// 从唯一契约同步只读 JSON；绝不改写 YAML。
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('../../node-backend/node_modules/yaml');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'docs/api/openapi.v1.yaml'), 'utf8');
const target = path.join(root, 'go-backend/internal/contract/openapi.json');
const json = JSON.stringify(yaml.parse(source), null, 2);
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== json) throw new Error('契约快照已过期');
} else fs.writeFileSync(target, json);
