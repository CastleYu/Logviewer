import React, { useState } from 'react';
import type { AiQuestion } from '../config/aiTypes';

interface Question { header?: string; question: string; options?: { label: string; description?: string }[]; multiple?: boolean; custom?: boolean }

export const AiQuestionForm: React.FC<{ question: AiQuestion; light?: boolean; onSubmit: (answers: string[][]) => Promise<void>; onReject: () => Promise<void> }> = ({ question, light = true, onSubmit, onReject }) => {
  const items = (Array.isArray(question.questions) ? question.questions : []) as Question[];
  const [answers, setAnswers] = useState<string[][]>(() => items.map(() => []));
  const [custom, setCustom] = useState<string[]>(() => items.map(() => ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (reject: boolean) => {
    setBusy(true); setError('');
    try { if (reject) await onReject(); else await onSubmit(answers.map((answer, index) => custom[index]?.trim() ? items[index].multiple ? [...answer, custom[index].trim()] : [custom[index].trim()] : answer)); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  return <form className={`mt-2 max-h-60 overflow-auto rounded-lg p-3 text-xs ${light ? 'bg-indigo-50 text-indigo-950' : 'bg-indigo-950/50 text-indigo-100'}`} onSubmit={(event) => { event.preventDefault(); void run(false); }}>
    {items.map((item, index) => <fieldset key={index} className="mb-3">
      <legend className="font-semibold">{item.header || item.question}</legend><p className="my-1">{item.question}</p>
      {item.options?.map((option) => <label key={option.label} className="my-1 flex items-start gap-2">
        <input type={item.multiple ? 'checkbox' : 'radio'} name={`question-${String(question.id)}-${index}`} checked={answers[index]?.includes(option.label) || false} onChange={() => setAnswers((old) => old.map((value, at) => at !== index ? value : item.multiple ? value.includes(option.label) ? value.filter((entry) => entry !== option.label) : [...value, option.label] : [option.label]))} />
        <span>{option.label}{option.description ? <span className="block text-indigo-800">{option.description}</span> : null}</span>
      </label>)}
      {item.custom !== false ? <input aria-label={`${item.header || item.question}：自定义回答`} value={custom[index] || ''} onChange={(e) => setCustom((old) => old.map((value, at) => at === index ? e.target.value : value))} placeholder="或输入回答" className="mt-1 w-full rounded border border-indigo-300 bg-white p-2" /> : null}
    </fieldset>)}
    {error ? <p role="alert" className="text-rose-700">{error}</p> : null}
    <div className="flex gap-2"><button disabled={busy || items.some((_, index) => !answers[index]?.length && !custom[index]?.trim())} className="rounded bg-indigo-600 px-3 py-1.5 text-white disabled:opacity-40">提交回答</button><button type="button" disabled={busy} onClick={() => void run(true)} className="rounded border border-indigo-300 px-3 py-1.5">拒绝</button></div>
  </form>;
}
export default AiQuestionForm;
