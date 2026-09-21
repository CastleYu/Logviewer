import { Fragment, useCallback, useEffect, useRef, useState, type Key } from 'react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { AiMessageLabels, AiMessageRole, AiMessageError, AiPartType, AiToolStatus, type AiMessage, type AiMessagePart } from '../config/aiMessageTypes';
import './ai-conversation.css';

export type AiConversationProps = { messages: AiMessage[]; busy: boolean; light: boolean; key?: Key };
type Value = Record<string, unknown>;
const isObject = (value: unknown): value is Value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const stringOf = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
const field = (value: unknown, key: string) => isObject(value) ? value[key] : undefined;
const safeUrl = (value: unknown) => { const url = String(value || ''); try { const parsed = new URL(url); return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : ''; } catch { return ''; } };
const statusLabel = (status: string) => ({ [AiToolStatus.Pending]: AiMessageLabels.Pending, [AiToolStatus.Running]: AiMessageLabels.Running, [AiToolStatus.Completed]: AiMessageLabels.Completed, [AiToolStatus.Error]: AiMessageLabels.Error }[status] || status);
const statusOf = (part: AiMessagePart) => String(field(part.state, 'status') || part.status || AiToolStatus.Pending);
const detailType = (type: string) => type === AiPartType.Reasoning || type === AiPartType.Tool || type === AiPartType.Agent || type === AiPartType.Subtask || type === AiPartType.Compaction || type === AiPartType.Retry || type === AiPartType.StepStart || type === AiPartType.StepFinish || type === AiPartType.Snapshot || type === AiPartType.Patch;

function Markdown({ value, streaming = false }: { value: string; streaming?: boolean }) {
  if (!value) return null;
  return <div className="ai-conversation__markdown"><Streamdown mode={streaming ? 'streaming' : 'static'} isAnimating={streaming} caret={streaming ? 'block' : undefined} translations={AiMessageLabels.Markdown} plugins={{ code }} skipHtml controls={{ code: { copy: true }, table: { copy: true } }} linkSafety={{ enabled: true }}>{value}</Streamdown></div>;
}

function Meta({ info }: { info: AiMessage['info'] }) {
  if (!info) return null;
  const stamp = isObject(info.time) ? field(info.time, 'created') : info.time;
  const time = typeof stamp === 'number' || typeof stamp === 'string' ? new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const model = stringOf(field(info, 'model') || field(info, 'modelID'));
  return <div className="ai-conversation__meta">{time}{model ? ` · ${model}` : ''}</div>;
}

function MessageError({ error }: { error: unknown }) {
  if (!error) return null;
  if (field(error, 'name') === AiMessageError.Aborted) return <p className="ai-conversation__meta">本轮已停止</p>;
  return <div role="alert" className="ai-conversation__meta ai-conversation__meta--error">错误：{stringOf(error)}</div>;
}

function ToolBody({ part }: { part: AiMessagePart }) {
  const state = isObject(part.state) ? part.state : {};
  const status = statusOf(part);
  const input = field(state, 'input') ?? part.input;
  const output = field(state, 'output') ?? field(state, 'result') ?? part.output;
  const error = field(state, 'error') ?? part.error;
  const attachments = field(state, 'attachments') ?? part.attachments;
  return <><div className="ai-conversation__meta">{stringOf(part.tool || part.name || part.title || 'tool')}</div>{input != null ? <pre className="ai-conversation__pre">input: {stringOf(input)}</pre> : null}{output != null ? <pre className="ai-conversation__pre">output: {stringOf(output)}</pre> : null}{error != null ? <pre className="ai-conversation__pre ai-conversation__pre--error">error: {stringOf(error)}</pre> : null}{attachments != null ? <pre className="ai-conversation__pre">attachments: {stringOf(attachments)}</pre> : null}<span className={`ai-conversation__status ai-conversation__status--${status}`}>{statusLabel(status)}</span><details><summary>完整工具详情</summary><pre className="ai-conversation__pre">{stringOf(part)}</pre></details></>;
}

function KnownBody({ part, type }: { part: AiMessagePart; type: string }) {
  if (type === AiPartType.Tool) return <ToolBody part={part} />;
  const keys: Record<string, string[]> = { [AiPartType.Reasoning]: ['text', 'content', 'reason', 'duration'], [AiPartType.Agent]: ['agent', 'description', 'prompt', 'status'], [AiPartType.Subtask]: ['agent', 'description', 'prompt', 'status'], [AiPartType.Compaction]: ['auto', 'summary', 'text', 'content'], [AiPartType.Retry]: ['attempt', 'reason', 'error', 'delay'], [AiPartType.StepStart]: ['step', 'name', 'model', 'input'], [AiPartType.StepFinish]: ['step', 'name', 'tokens', 'cost', 'reason', 'output'], [AiPartType.Snapshot]: ['id', 'path', 'hash', 'files'], [AiPartType.Patch]: ['files', 'hash', 'patch', 'diff'] };
  const selected = keys[type] || [];
  return <>{selected.map((key) => part[key] != null ? <pre key={key} className="ai-conversation__pre">{key}: {stringOf(part[key])}</pre> : null)}<details><summary>{AiMessageLabels.Details}</summary><pre className="ai-conversation__pre">{stringOf(part)}</pre></details></>;
}

function FileBody({ part }: { part: AiMessagePart }) {
  const url = safeUrl(part.url); const filename = stringOf(part.filename || part.name || part.path || '文件'); const mime = stringOf(part.mime || part.mimeType);
  return <><div className="ai-conversation__meta">{filename}{mime ? ` · ${mime}` : ''}</div>{url && mime.startsWith('image/') ? <img className="ai-conversation__file-image" src={url} alt={filename} /> : null}{url ? <a className="ai-conversation__file-link" href={url} target="_blank" rel="noreferrer noopener">打开文件</a> : null}<pre className="ai-conversation__pre">{stringOf(part.content || part.text || (url ? '' : part))}</pre></>;
}

function Part({ part, streaming }: { part: AiMessagePart; streaming: boolean }) {
  const type = String(part.type || 'unknown');
  if (type === AiPartType.Text) return <Markdown value={stringOf(part.text ?? part.content)} streaming={streaming} />;
  if (type === AiPartType.File) return <details className="ai-conversation__part"><summary>{stringOf(part.filename || part.name || '文件')}</summary><div className="ai-conversation__part-content"><FileBody part={part} /></div></details>;
  if (detailType(type)) { const status = type === AiPartType.Tool ? statusOf(part) : ''; return <details className="ai-conversation__part" open={status === AiToolStatus.Error}><summary>{type === AiPartType.Reasoning ? `${AiMessageLabels.Reasoning}${part.duration ? ` · ${stringOf(part.duration)}` : ''}` : type === AiPartType.Tool ? `${stringOf(part.tool || part.name || AiMessageLabels.Tool)} · ${statusLabel(status)}` : type === AiPartType.Compaction ? (part.auto ? '自动压缩上下文' : '手动压缩上下文') : type}</summary><div className="ai-conversation__part-content"><KnownBody part={part} type={type} /></div></details>; }
  return <details className="ai-conversation__part"><summary>{AiMessageLabels.Unknown} · {type}</summary><pre className="ai-conversation__pre">{stringOf(part)}</pre></details>;
}

export function AiConversation({ messages, busy, light }: AiConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null); const [atBottom, setAtBottom] = useState(true);
  const onScroll = useCallback(() => { const node = scrollRef.current; if (node) setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 36); }, []);
  useEffect(() => { const node = scrollRef.current; if (node && atBottom) node.scrollTop = node.scrollHeight; }, [messages, busy, atBottom]);
  const back = () => { const node = scrollRef.current; if (node) { node.scrollTop = node.scrollHeight; setAtBottom(true); node.focus(); } };
  return <section className={`ai-conversation ${light ? 'ai-conversation--light' : 'ai-conversation--dark'}`} aria-label="AI 消息"><div className="ai-conversation__scroll" ref={scrollRef} onScroll={onScroll} tabIndex={0} role="log" aria-live="polite">
    {!messages.length ? <div className="ai-conversation__empty">{busy ? '等待 Agent 返回…' : '暂无消息'}</div> : messages.map((message, index) => { const info = message.info || {}; const role = String(info.role || AiMessageRole.Assistant); const user = role === AiMessageRole.User; const id = String(info.id || `message-${index}`); const parts = Array.isArray(message.parts) ? message.parts : []; const active = busy && !info.finish && index === messages.length - 1 && !user;
      return <article className={`ai-conversation__message ai-conversation__message--${user ? 'user' : 'assistant'}`} key={id}><div className="ai-conversation__head"><span>{user ? AiMessageLabels.User : AiMessageLabels.Assistant}</span><Meta info={info} /></div>{user ? <details open={parts.map((part) => stringOf(part.text || part.content)).join('').length < 1600}><summary className="ai-conversation__assistant-toggle">{parts.map((part) => stringOf(part.text || part.content)).join('').length > 1600 ? '展开长输入' : AiMessageLabels.User}</summary><div className="ai-conversation__body">{parts.map((part, partIndex) => <Fragment key={String(part.id || `${id}-part-${partIndex}`)}>{part.type === AiPartType.Text ? <pre className="ai-conversation__pre">{stringOf(part.text || part.content)}</pre> : <Part part={part} streaming={false} />}</Fragment>)}</div></details> : <details open className="ai-conversation__body"><summary className="ai-conversation__assistant-toggle">{info.summary ? AiMessageLabels.Summary : AiMessageLabels.Response}</summary>{parts.map((part, partIndex) => <Fragment key={String(part.id || `${id}-part-${partIndex}`)}><Part part={part} streaming={active} /></Fragment>)}</details>}<details className="ai-conversation__metadata"><summary>消息详情</summary><pre className="ai-conversation__pre">{stringOf(info)}</pre></details><MessageError error={info.error} /></article>; })}
  </div>{!atBottom ? <button type="button" className="ai-conversation__bottom" onClick={back}>{AiMessageLabels.BackToBottom}</button> : null}</section>;
}
