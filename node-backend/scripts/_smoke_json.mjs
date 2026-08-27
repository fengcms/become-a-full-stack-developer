/**
 * scripts/_smoke_json.mjs
 * 极简 JSON 字段提取器：从 stdin 读 JSON，按点号路径打印叶子值。
 * 用法：printf '%s' "$JSON" | node _smoke_json.mjs data.accessToken
 * 目的：让冒烟脚本不依赖 jq（macOS 默认未装），仅依赖 Node。
 */
import process from 'node:process';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const path = process.argv[2] || '';
  try {
    const obj = JSON.parse(input);
    const val = path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    if (val === undefined || val === null) {
      process.stdout.write('');
    } else if (typeof val === 'object') {
      process.stdout.write(JSON.stringify(val));
    } else {
      process.stdout.write(String(val));
    }
  } catch {
    process.stdout.write('');
  }
});
