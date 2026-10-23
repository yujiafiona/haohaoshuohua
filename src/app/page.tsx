"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "translate" | "train";
type TargetRole = "boss" | "coworker" | "partner" | "parent" | "friend" | "child";
type Scenario = "ask" | "refuse" | "comfort" | "complain" | "report";
type Context = { targetRole: TargetRole; scenario: Scenario; roleProfile: string };
type Pending = "translate" | "question" | "score" | null;
interface TranslateResult {
  optimizedText: string;
  angerScore: number;
  attackScore: number;
  empathyScore: number;
  clarityScore: number;
  explanation?: string;
  theoryTips?: string;
}
interface CoachResponse {
  translate?: TranslateResult;
  trainQuestion?: string;
  trainScoreText?: string;
  _demo?: boolean;
  error?: string;
}
interface Practice {
  question: string;
  context: Context;
  feedback?: string;
  demo: boolean;
}
const ROLES: { value: TargetRole; label: string }[] = [
  { value: "boss", label: "老板" }, { value: "coworker", label: "同事" },
  { value: "partner", label: "伴侣" }, { value: "parent", label: "父母" },
  { value: "child", label: "子女" }, { value: "friend", label: "朋友" }
];
const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: "ask", label: "提需求 / 寻求支持" }, { value: "report", label: "汇报进展 / 对齐预期" },
  { value: "refuse", label: "拒绝 / 表达边界" }, { value: "complain", label: "表达不满 / 讨论分歧" },
  { value: "comfort", label: "安慰 / 提供支持" }
];
const EXAMPLES: { label: string; text: string; role: TargetRole; scene: Scenario }[] = [
  { label: "临时加需求", text: "这个需求又要今天上线？我手上的事情已经排满了，能不能先把优先级说清楚？", role: "coworker", scene: "refuse" },
  { label: "关键节点汇报", text: "目前核心流程已经完成，但新加的需求会影响原定时间。我需要先确认这次上线最重要的目标。", role: "boss", scene: "report" },
  { label: "和孩子做约定", text: "说好玩完就收拾玩具，怎么每次都要我提醒？", role: "child", scene: "ask" }
];
const LEVELS = [
  { threshold: 0, label: "初识表达" }, { threshold: 20, label: "情绪译者" },
  { threshold: 60, label: "沟通练习生" }, { threshold: 120, label: "非暴力玩家" },
  { threshold: 220, label: "关键对话高手" }
];
const STORAGE_KEY = "haohuoshuohua_stats_v1";
const roleLabel = (role: TargetRole) => ROLES.find(item => item.value === role)?.label ?? role;
const sceneLabel = (scene: Scenario) => SCENARIOS.find(item => item.value === scene)?.label ?? scene;

function Icon({ name, className = "" }: { name: "chat" | "spark" | "arrow" | "copy" | "check" | "leaf"; className?: string }) {
  const paths = {
    chat: <><path d="M5 17.5 3.5 21l5-2H17a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v7a4 4 0 0 0 2 3.5Z" /><path d="M8 9h8M8 13h5" /></>,
    spark: <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    leaf: <><path d="M20 4C7 2 2 9 6 15c5 7 15 1 14-11Z" /><path d="M4 21 15 10" /></>
  };
  return <svg className={"icon " + className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function parseFeedback(text: string) {
  const parts: { title: string; content: string }[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^【([^】]+)】\s*(.*)$/);
    if (match) parts.push({ title: match[1], content: match[2].trim() });
    else if (parts.length && line.trim()) parts[parts.length - 1].content += "\n" + line.trim();
  }
  return parts.length ? parts : [{ title: "教练点评", content: text }];
}
async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* Continue with the HTTP-compatible fallback. */ }
  const field = document.createElement("textarea");
  field.value = text;
  field.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(field);
  field.select();
  try { return document.execCommand("copy"); }
  catch { return false; }
  finally { field.remove(); }
}
async function readResponse(res: Response, onText?: (text: string) => void): Promise<CoachResponse> {
  if (!res.ok) {
    const data = await res.json().catch(() => null) as CoachResponse | null;
    throw new Error(data?.error || "这次没有生成成功，请再试一次。");
  }
  if (!res.headers.get("Content-Type")?.includes("ndjson")) return res.json();
  const reader = res.body?.getReader();
  if (!reader) throw new Error("没有收到完整结果，请再试一次。");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: CoachResponse | undefined;
  const process = (line: string) => {
    if (!line.trim()) return;
    const message = JSON.parse(line) as { type: string; content?: string; data?: TranslateResult; error?: string; _demo?: boolean };
    if (message.type === "error") throw new Error(message.error || "生成中断，请重试。");
    if (message.type === "text") onText?.(message.content ?? "");
    if (message.type === "done" && message.data) result = { translate: message.data, _demo: message._demo };
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(process);
    }
    buffer += decoder.decode();
    process(buffer);
  } finally { reader.releaseLock(); }
  if (!result) throw new Error("结果传输中断，请再试一次。");
  return result;
}

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("translate");
  const [rawText, setRawText] = useState("");
  const [targetRole, setTargetRole] = useState<TargetRole>("coworker");
  const [scenario, setScenario] = useState<Scenario>("ask");
  const [profile, setProfile] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [resultDemo, setResultDemo] = useState(false);
  const [resultContext, setResultContext] = useState<Context | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [practice, setPractice] = useState<Practice | null>(null);
  const [answer, setAnswer] = useState("");
  const [points, setPoints] = useState(0);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const practiceRef = useRef<HTMLElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      if (Number.isFinite(saved.points) && saved.points >= 0) setPoints(saved.points);
    } catch { /* Storage is optional. */ }
    return () => requestRef.current?.abort();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => { setToast(""); setCopied(false); }, 2400);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    // A result only belongs to the exact input and settings that generated it.
    setResult(null);
    setResultContext(null);
    setStreamingText("");
    setResultDemo(false);
    setCopied(false);
    setError("");
  }, [rawText, targetRole, scenario, profile]);
  const award = () => setPoints(previous => {
    const next = previous + 5;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ points: next })); } catch { /* Keep the successful result usable. */ }
    return next;
  });
  const level = LEVELS.reduce((found, item, index) => points >= item.threshold ? index : found, 0);
  const nextLevel = LEVELS[level + 1];
  const progress = nextLevel ? Math.min(100, (points - LEVELS[level].threshold) / (nextLevel.threshold - LEVELS[level].threshold) * 100) : 100;
  const context: Context = { targetRole, scenario, roleProfile: profile.trim() };
  const contextChanged = practice && JSON.stringify(practice.context) !== JSON.stringify(context);
  const busy = pending !== null;
  const call = async (kind: Exclude<Pending, null>, body: object, apply: (data: CoachResponse) => void) => {
    setError("");
    setPending(kind);
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch("/api/coach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal
      });
      const data = await readResponse(response, kind === "translate" ? setStreamingText : undefined);
      apply(data);
      award();
    } catch (err) {
      setError(err instanceof Error && err.name === "AbortError" ? "这次响应时间较长，请再试一次。" : err instanceof Error ? err.message : "遇到了一点问题，请重试。");
    } finally {
      clearTimeout(timer);
      setPending(null);
      setStreamingText("");
      requestRef.current = null;
    }
  };
  const translate = () => {
    if (!rawText.trim()) { setError("先写下你想表达的内容，也可以用下面的示例开始。"); inputRef.current?.focus(); return; }
    setResult(null);
    setCopied(false);
    setStreamingText("");
    setResultContext(context);
    if (window.matchMedia("(max-width: 760px)").matches) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    void call("translate", { mode: "translate", text: rawText.trim(), ...context, stream: true }, data => {
      if (!data.translate?.optimizedText) throw new Error("没有收到完整表达，请重试。");
      setResult(data.translate);
      setResultDemo(Boolean(data._demo));
    });
  };
  const newQuestion = () => {
    void call("question", { mode: "train", ...context, previousQuestion: practice?.question }, data => {
      if (!data.trainQuestion) throw new Error("没有收到练习题，请重试。");
      setPractice({ question: data.trainQuestion, context, demo: Boolean(data._demo) });
      setAnswer("");
      if (window.matchMedia("(max-width: 760px)").matches) practiceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const score = () => {
    if (!practice) return;
    if (!answer.trim()) { setError("先写一句你会怎么说，再获取点评。"); return; }
    const current = practice;
    void call("score", { mode: "train", ...current.context, trainQuestion: current.question, trainAnswer: answer.trim() }, data => {
      if (!data.trainScoreText) throw new Error("没有收到点评，请重试。");
      setPractice({ ...current, feedback: data.trainScoreText, demo: Boolean(data._demo) });
    });
  };
  const contextFields = (
    <fieldset className="context-fields" disabled={busy}>
      <legend className="sr-only">沟通对象与场景</legend>
      <div className="field-group"><span className="field-label" id="role-label">这句话，说给谁？</span>
        <div className="role-options" role="group" aria-labelledby="role-label">{ROLES.map(role => <button type="button" key={role.value} className={"role-option " + (targetRole === role.value ? "selected" : "")} aria-pressed={targetRole === role.value} onClick={() => setTargetRole(role.value)}>{role.label}</button>)}</div>
      </div>
      <div className="field-group"><label className="field-label" htmlFor="scenario">想达成什么？</label><div className="select-wrap"><select id="scenario" value={scenario} onChange={event => setScenario(event.target.value as Scenario)}>{SCENARIOS.map(scene => <option key={scene.value} value={scene.value}>{scene.label}</option>)}</select></div></div>
      <details className="context-details"><summary><span className="details-plus">+</span>补充对方特点或背景<span className="optional">选填</span>{profile.trim() && <span className="filled-dot" aria-label="已填写" />}</summary><label className="sr-only" htmlFor="profile">对方特点或沟通背景</label><textarea id="profile" rows={2} value={profile} onChange={event => setProfile(event.target.value)} placeholder="比如：对方时间很紧，希望先听结论；或补充事情的来龙去脉。" /></details>
    </fieldset>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">跳到沟通工作区</a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="好好说话首页"><span className="brand-mark"><Icon name="chat" /></span><span><strong>好好说话<span className="brand-dot">.</span></strong><small>AI 沟通练习室</small></span></a>
        <nav className="mode-nav" aria-label="选择沟通方式"><button type="button" className={mode === "translate" ? "active" : ""} aria-pressed={mode === "translate"} disabled={busy} onClick={() => { setMode("translate"); setError(""); }}>帮我改写</button><button type="button" className={mode === "train" ? "active" : ""} aria-pressed={mode === "train"} disabled={busy} onClick={() => { setMode("train"); setError(""); }}>场景练习</button></nav>
        <details className="growth"><summary><Icon name="leaf" /><span>{LEVELS[level].label}</span><b>{points}</b></summary><div className="growth-popover"><strong>每一次练习，都算数</strong><p>功德值 {points} · 成功使用一次 +5</p><div className="growth-track"><span style={{ width: progress + "%" }} /></div><small>{nextLevel ? "再积累 " + (nextLevel.threshold - points) + " 点，成为「" + nextLevel.label + "」" : "你已达成最高等级，继续保持练习。"}</small><small className="growth-storage">成长记录保存在当前浏览器</small></div></details>
      </header>
      <main className="main">
        <section className="intro" aria-labelledby="page-title"><p className="eyebrow"><span />给重要对话，留一点准备时间</p><h1 id="page-title">{mode === "translate" ? <>把想说的话，<em>说得更好。</em></> : <>好的沟通，<em>可以练习。</em></>}</h1><p className="intro-description">{mode === "translate" ? "保留你的立场，把感受、需求和期待表达清楚。" : "在真实对话前，先在这里试着说一次。"}</p></section>
        <div id="workspace" className={"workspace " + (mode === "train" ? "workspace-train" : "")}>
          <section className="editor-card" aria-labelledby="editor-title">
            <div className="card-heading"><span className="step-number">01</span><h2 id="editor-title">{mode === "translate" ? "你想表达什么？" : "选择一个练习场景"}</h2><span className="card-kicker">{mode === "translate" ? "从你的原话开始" : "一次只练一句"}</span></div>
            {mode === "translate" ? <><label className="sr-only" htmlFor="raw-text">你想表达的原话</label><div className="writing-area"><textarea ref={inputRef} id="raw-text" value={rawText} disabled={busy} onChange={event => setRawText(event.target.value)} placeholder="写下你准备说的话，或描述一下发生了什么……" /><div className="writing-bottom"><span>按你的想法写就好</span><span>{rawText.length} 字</span></div></div><div className="examples"><span>试试这些情境</span><div>{EXAMPLES.map(example => <button key={example.label} type="button" disabled={busy} onClick={() => { setRawText(example.text); setTargetRole(example.role); setScenario(example.scene); setError(""); inputRef.current?.focus(); }}>{example.label}<span aria-hidden="true">↗</span></button>)}</div></div></> : <p className="setup-description">选一个你最近会遇到的对话，让教练出一道贴近你的练习题。</p>}
            {contextFields}
            <div className="editor-actions"><button className="primary-button" type="button" disabled={busy} onClick={mode === "translate" ? translate : newQuestion}>{busy ? <span className="button-spinner" /> : <Icon name="spark" />}{mode === "translate" ? pending === "translate" ? "正在整理表达" : "帮我好好说" : pending === "question" ? "正在准备练习" : contextChanged ? "按新设置出题" : practice ? "换一道题" : "生成练习场景"}{!busy && <Icon name="arrow" />}</button><p>{mode === "translate" ? "先看建议，再调整成你自己的语气" : "选好场景 → 写下表达 → 获得点评"}</p></div>
          </section>
          {mode === "translate" ? <section className={"result-panel " + (result || streamingText ? "has-result" : "")} ref={resultRef} aria-labelledby="result-title" aria-busy={pending === "translate"}>
            <div className="card-heading"><span className="step-number">02</span><h2 id="result-title">换一种表达</h2><span className="result-status"><span />{pending === "translate" ? "正在生成" : result ? "已整理好" : "为你留好位置"}</span></div>
            {result || streamingText ? <div className="result-content">
              <div className="result-meta">{resultContext && <span>{roleLabel(resultContext.targetRole)} · {sceneLabel(resultContext.scenario)}</span>}{resultDemo && !busy && <span className="demo-badge">演示示例</span>}</div>
              <p className="suggested-text">{streamingText || result?.optimizedText}{pending === "translate" && <span className="stream-cursor" />}</p>
              {pending === "translate" ? <p className="stream-status">表达先给你，分析正在补充…</p> : result && <>
                <div className="result-actions"><button type="button" className="copy-button" onClick={async () => { const success = await copyText(result.optimizedText); setCopied(success); setToast(success ? "表达已复制，可以按你的语气再调整" : "暂时无法复制，请长按或选中文字复制"); }}><Icon name={copied ? "check" : "copy"} />{copied ? "已复制" : "复制这段话"}</button><span>带着自己的语气使用</span></div>
                {resultDemo && <p className="demo-notice">当前按对象和场景展示预设示例；连接 AI 后，才会根据原话和背景实时改写。</p>}
                {(result.explanation || result.theoryTips) && <div className="insight"><span className="insight-icon"><Icon name="leaf" /></span><div><h3>表达小贴士</h3><p>{result.explanation || result.theoryTips}</p>{result.explanation && result.theoryTips && <p>{result.theoryTips}</p>}</div></div>}
                <details className="analysis-details"><summary>看看表达分析<span>四个维度<span aria-hidden="true">↗</span></span></summary><div className="score-grid">{[{ label: "情绪强度", value: result.angerScore, note: "越低越平和", className: "warm" }, { label: "攻击性", value: result.attackScore, note: "越低越少指责", className: "warm" }, { label: "共情度", value: result.empathyScore, note: "越高越能照顾感受", className: "green" }, { label: "清晰度", value: result.clarityScore, note: "越高越明确", className: "green" }].map(item => <div className="score-item" key={item.label}><div><span>{item.label}</span><strong>{item.value}<small>/100</small></strong></div><div className={"score-track " + item.className}><span style={{ width: Math.max(0, Math.min(100, item.value)) + "%" }} /></div><small>{item.note}</small></div>)}</div><p className="analysis-note">AI 评分仅作练习参考。</p></details>
              </>}
            </div> : pending === "translate" ? <div className="result-loading" role="status"><span className="loading-symbol"><Icon name="spark" /></span><h3>正在找到更合适的说法</h3><p>结合对象和场景，整理你的表达。</p><div className="skeleton-lines"><i /><i /><i /></div></div> : <div className="result-empty"><div className="empty-illustration"><span className="bubble bubble-one">好好表达</span><span className="bubble bubble-two"><i /><i /><i /></span><span className="little-spark">✳</span></div><h3>让你的重点，被好好听见。</h3><p>写下原话，得到一份更清楚、<br />更有分寸的表达建议。</p><div className="empty-principles"><span>说清事实</span><i /><span>保留诉求</span><i /><span>提出期待</span></div></div>}
          </section> : <section className="practice-panel" ref={practiceRef} aria-labelledby="practice-title" aria-busy={pending === "question" || pending === "score"}>
            <div className="card-heading"><span className="step-number">02</span><h2 id="practice-title">试着说一句</h2><span className="card-kicker">你的沟通练习</span></div>
            {pending === "question" ? <div className="result-loading" role="status"><span className="loading-symbol"><Icon name="spark" /></span><h3>正在准备你的练习场景</h3><p>从一次具体的对话开始。</p></div> : practice ? <div className="practice-content">
              <div className="result-meta"><span>{roleLabel(practice.context.targetRole)} · {sceneLabel(practice.context.scenario)}</span>{practice.demo && <span className="demo-badge">演示示例</span>}</div>
              {contextChanged && <p className="context-notice">这道题保留出题时的设置。想练新场景，可以点“按新设置出题”。</p>}
              <div className="question-block"><span>想象这样一个时刻</span><p>{practice.question}</p></div>
              <label className="field-label" htmlFor="answer">如果是你，会怎么说？</label>
              <textarea id="answer" className="answer-input" value={answer} disabled={busy} onChange={event => { setAnswer(event.target.value); if (practice.feedback) setPractice({ ...practice, feedback: undefined }); }} placeholder="写一句你会实际说出口的话……" />
              <div className="practice-actions"><button type="button" className="primary-button" disabled={busy || !answer.trim()} onClick={score}>{pending === "score" ? <span className="button-spinner" /> : <Icon name="spark" />}{pending === "score" ? "教练正在看你的表达" : "获取教练点评"}</button><span>没有标准答案，先试着表达</span></div>
              {practice.demo && <p className="demo-notice">当前展示预设练习与点评，用于体验流程。</p>}
              {practice.feedback && <div className="feedback" aria-live="polite"><div className="feedback-heading"><Icon name="leaf" /><h3>给你的一点反馈</h3></div>{parseFeedback(practice.feedback).map((part, index) => <div className="feedback-part" key={index}><h4>{part.title}</h4><p>{part.content}</p></div>)}<button type="button" className="text-button" disabled={busy} onClick={newQuestion}>再练一道题<Icon name="arrow" /></button></div>}
            </div> : <div className="result-empty"><div className="practice-empty-icon"><Icon name="chat" /></div><h3>把下一次对话，提前练一遍。</h3><p>选好对象和场景，生成练习题。<br />写下你的表达，再听听教练的反馈。</p><div className="practice-steps"><span>01 出题</span><span>02 表达</span><span>03 点评</span></div></div>}
          </section>}
        </div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="关闭提示">×</button></div>}
        <footer className="page-footer"><span><Icon name="leaf" />每一次认真表达，都是向理解走近一点。</span><span>灵感来自《非暴力沟通》《关键对话》</span></footer>
      </main>
      {toast && <div className="toast" role="status"><Icon name={copied ? "check" : "chat"} />{toast}</div>}
    </div>
  );
}
