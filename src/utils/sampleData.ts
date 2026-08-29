/**
 * 示例日志生成器，用于快速功能演示与性能测试
 */

const LEVELS = ['INFO', 'INFO', 'DEBUG', 'WARN', 'WARNING', 'ERROR', 'ERR'];
const MODULES = ['report_service', 'data_pipeline', 'payment_engine', 'gateway_proxy', 'db_connector', 'task_dispatcher'];
const FUNCTIONS = ['report_label_detail', 'process_payload', 'validate_signature', 'sync_state', 'fetch_remote_data', 'dispatch_event'];
const FILES = ['sdgfdgdf.py', 'report_worker.py', 'gateway_handler.go', 'data_processor.py', 'pipeline_connector.cpp'];

// 包含真实场景脱敏的超长 JSON 复杂嵌套结构与 URL 数组
const LONG_JSON_OPERATION_DESCRIPTIONS = [
  'report sadasd label detail {"sadasd": "asdsadsadasd", "asdsadasdasdasd": ["https://***.***.123.123:23123/asdsad/asdasd/asdasd/asdasd/********************************/asdasd/asdasdas?sadasd=*********************************&asdasda=***********************************", "{}", "{\'sadsad\': \'********************************\', \'asdasd\': \'asdas\', \'asdasda\': [{\'asdasd\': \'*********************************\', \'asdasd\': [{\'asdad\': \'********************************\', \'asdasd\': None}]}]}", "*********************************"], "asdasda": 1785404053, "logDetail": null, "fdgsre": null, "asdadas": null, "asdasdas": 1}',
  "json_param_object: {'job': {'asd': [{'extendInfo': None, 'format': 0, 'generatedBy': '', 'id': 'sdada-asdsad-asdasd-asdasd-asdadad', 'name': '', 'protectEnv': {'auth:******",
  'batch payload process status {"cluster_id": "CLS-99812", "nodes": ["10.0.1.12", "10.0.1.15"], "meta": {"headers": {"X-Trace-Id": "TR-8812903"}, "body": [{"item_id": [101, 102, 103], "params": {"flag": [true, false]}}]}}',
  'HTTP response callback detail {"statusCode": 200, "data": {"items": [{"id": "ITEM-001", "urls": ["https://api.example.com/v1/download/file.zip?token=abc[123]&sign=xyz[456]"]}, {"id": "ITEM-002", "nested": [{"key": "val"}]}]}}',
  'User [ID: 9812] executed [Login] with metadata {"session": "[TOKEN-98123]", "roles": ["ADMIN", "AUDITOR"], "features": ["EXPORT", "SEARCH"]}',
  'Database query trace {"sql": "SELECT * FROM logs WHERE tag IN [\'a\', \'b\'] AND id = [100]", "bindings": [100, "a", "b"], "rows_affected": 42}',
];

const STACK_TRACES = [
  'java.lang.NullPointerException: Cannot invoke "User.getName()" because "user" is null',
  '    at com.system.auth.AuthManager.validateToken(AuthManager.java:142)',
  '    at com.system.gateway.UserGateway.handleRequest(UserGateway.java:88)',
  'CRITICAL ERROR: Connection refused to remote host 192.168.1.100:3306 (SocketTimeoutException)',
  'Malformed JSON input at byte offset 0x000F4B -- unexpected end of stream',
];

export function generateSampleLogsText(count: number = 5000): string {
  const lines: string[] = [];
  const baseTime = new Date('2026-07-30T17:34:00.000Z').getTime();

  for (let i = 0; i < count; i++) {
    // 约每 25 行插入一行异常崩溃解析失败行（用于演示解析失败行的选定与多选复制）
    if (i > 0 && i % 25 === 0) {
      const trace = STACK_TRACES[(i / 25) % STACK_TRACES.length];
      lines.push(trace);
      continue;
    }

    const timestamp = new Date(baseTime + i * 120).toISOString().replace('T', ' ').replace('Z', '').replace('.', ',');
    const level = LEVELS[i % LEVELS.length];
    const requestId = `****${100 + (i % 899)}-****-****-****-************`;
    const opDesc = LONG_JSON_OPERATION_DESCRIPTIONS[i % LONG_JSON_OPERATION_DESCRIPTIONS.length];
    const func = FUNCTIONS[i % FUNCTIONS.length];
    const threadId = `0x${(300000 + (i * 13) % 900000).toString(16)}`;
    const memAddr = `0x7fff${(20000000 + (i * 98765) % 80000000).toString(16)}`;
    const module = MODULES[i % MODULES.length];
    const fileName = FILES[i % FILES.length];
    const lineNum = (10 + (i * 17) % 990).toString();

    // 格式: [时间戳][日志级别][请求ID][操作描述][函数名][线程ID][内存地址][模块][文件名][行号]
    const line = `[${timestamp}][${level}][${requestId}][${opDesc}][${func}][${threadId}][${memAddr}][${module}][${fileName}][${lineNum}]`;
    lines.push(line);
  }

  return lines.join('\n');
}
