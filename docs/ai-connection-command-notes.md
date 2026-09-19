# 连接回退补充执行记录

- Windows PowerShell 下 `rg scripts/verify-ai*` 未展开文件通配符（os error 123）。后续使用 `rg -g 'verify-ai*' scripts`。
- 首版受管进程实际验收报 `fixture not ready`：原 PowerShell/C# 版本使用了 PS5 不支持的语法与不正确的 Job 结构，已改为 PS5 兼容代码、完整扩展限制结构及真实进程句柄等待；以真实 cmd 子孙进程测试重新验收。
- 可选故障文件尚不存在时读取返回非零；后续先 Test-Path，不再读取不存在的可选记录。
