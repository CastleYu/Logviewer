import { useEffect, useState } from 'react';
import { CheckCircle2, CirclePause, LoaderCircle, AlertCircle } from 'lucide-react';
import { AiSessionState, type AiSession } from '../config/aiTypes';
import { AiUi } from '../config/aiUiTypes';

export function AiActivity({ session, submitting, light }: { session?: AiSession; submitting: boolean; light: boolean }) {
  const [now, setNow] = useState(Date.now());
  const working = submitting || session?.state === AiSessionState.Busy || session?.state === AiSessionState.Accepted;
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => setNow(Date.now()), AiUi.ClockMs);
    return () => clearInterval(timer);
  }, [working]);
  if (!session && !submitting) return null;
  const waiting = !!(session?.permissions.length || session?.questions.length);
  const failed = session?.state === AiSessionState.Error;
  const stopped = session?.state === AiSessionState.Aborted;
  const label = submitting ? '正在发送请求…' : session?.permissions.length ? '等待权限确认' : session?.questions.length ? '等待你的回答' : session?.state === AiSessionState.Idle && !session.messages.length ? '会话已就绪' : session?.activity?.message || AiUi.Labels[session?.activity?.type || session?.state || ''] || (working ? 'Agent 正在工作' : '会话已就绪');
  const elapsed = session?.submittedAt && working ? Math.max(0, Math.floor((now - session.submittedAt) / 1000)) : 0;
  const retryAt = session?.activity?.next;
  return <div role="status" aria-live="polite" className={`flex min-w-0 items-start gap-2 rounded-md px-2 py-2 text-xs ${failed ? light ? 'text-rose-600' : 'text-rose-300' : waiting ? light ? 'text-amber-700' : 'text-amber-300' : light ? 'text-slate-500' : 'text-slate-400'}`}>
    {failed ? <AlertCircle className="h-4 w-4 shrink-0" /> : waiting || stopped ? <CirclePause className="h-4 w-4 shrink-0" /> : working ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
    <div className="min-w-0 flex-1 break-words"><span>{label}</span>{session?.activity?.attempt ? <span> · 第 {session.activity.attempt} 次重试</span> : null}{retryAt && working ? <span> · {Math.max(0, Math.ceil((retryAt - now) / 1000))} 秒后</span> : null}</div>
    {elapsed > 0 ? <span aria-live="off" className="shrink-0 tabular-nums">{elapsed < 60 ? `${elapsed} 秒` : `${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒`}</span> : null}
  </div>;
}
