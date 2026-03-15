"use client";

import { useEffect, useMemo, useState } from "react";

type Mode = "translate" | "train";

type TargetRole = "boss" | "coworker" | "partner" | "parent" | "friend";

type Scenario =
  | "ask"
  | "refuse"
  | "comfort"
  | "complain";

interface TranslateResult {
  optimizedText: string;
  angerScore: number;
  attackScore: number;
  empathyScore: number;
  clarityScore: number;
  explanation?: string;
  theoryTips?: string;
}

interface TrainState {
  question?: string;
  lastScoreText?: string;
}

interface CoachResponse {
  mode: Mode;
  translate?: TranslateResult;
  trainQuestion?: string;
  trainScoreText?: string;
  _demo?: boolean;
}

interface Stats {
  points: number;
  level: number;
}

const STORAGE_KEY = "haohuoshuohua_stats_v1";

const EXAMPLE_RAW_TEXT =
  "请问「尽快」是本周、本月，还是本世纪？";

const LEVELS = [
  { threshold: 0, label: "初识表达" },
  { threshold: 20, label: "情绪译者" },
  { threshold: 60, label: "沟通练习生" },
  { threshold: 120, label: "非暴力玩家" },
  { threshold: 220, label: "关键对话高手" }
];

function getLevel(points: number) {
  let levelIndex = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].threshold) {
      levelIndex = i;
    }
  }
  return { index: levelIndex, label: LEVELS[levelIndex].label };
}

function loadStats(): Stats {
  if (typeof window === "undefined") return { points: 0, level: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { points: 0, level: 0 };
    const parsed = JSON.parse(raw) as Stats;
    if (typeof parsed.points !== "number") return { points: 0, level: 0 };
    const lvl = getLevel(parsed.points);
    return { points: parsed.points, level: lvl.index };
  } catch {
    return { points: 0, level: 0 };
  }
}

function saveStats(stats: Stats) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

// 将教练评语按【标题】分段，便于展示
function parseCoachScoreText(text: string): { title: string; content: string }[] {
  if (!text?.trim()) return [];
  const segments: { title: string; content: string }[] = [];
  const lines = text.split(/\n/);
  let current: { title: string; content: string } | null = null;
  for (const line of lines) {
    const match = line.match(/^【([^】]+)】\s*(.*)$/);
    if (match) {
      current = { title: match[1], content: match[2].trim() };
      segments.push(current);
    } else if (current && line.trim()) {
      current.content += (current.content ? "\n" : "") + line.trim();
    }
  }
  if (segments.length === 0) return [{ title: "评语", content: text.trim() }];
  return segments;
}

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("translate");
  const [rawText, setRawText] = useState("");
  const [targetRole, setTargetRole] = useState<TargetRole>("partner");
  const [scenario, setScenario] = useState<Scenario>("complain");
  const [profile, setProfile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<TranslateResult | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [train, setTrain] = useState<TrainState>({});
  const [isDemo, setIsDemo] = useState(false);
  const [copied, setCopied] = useState(false);

  const [answerDraft, setAnswerDraft] = useState("");

  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [loadingTip, setLoadingTip] = useState(0);

  const LOADING_TIPS = [
    "正在理解你的情绪…",
    "沟通教练在帮你润色～",
    "把刺耳的话翻译成好听的…",
    "马上就好，深呼吸～",
    "在找更温和的说法…",
    "快好了，别急～"
  ];

  useEffect(() => {
    const loaded = loadStats();
    setStats(loaded);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => {
      setLoadingTip(i => (i + 1) % LOADING_TIPS.length);
    }, 2500);
    return () => clearInterval(t);
  }, [loading]);

  const currentLevel = useMemo(() => getLevel(stats.points), [stats.points]);

  const angerTag = useMemo(() => {
    if (!result) return "";
    if (result.angerScore <= 20) return "几乎无怒气";
    if (result.angerScore <= 40) return "情绪轻微";
    if (result.angerScore <= 70) return "情绪偏强";
    return "火山高能预警";
  }, [result]);

  const handleCall = async (requestedMode: Mode) => {
    if (requestedMode === "translate" && !rawText.trim()) {
      setError("先把真实想说的话告诉我吧。");
      return;
    }
    if (requestedMode === "train" && train.question && !answerDraft.trim()) {
      setError("先写一句你会说的话再提交。");
      return;
    }
    setError(null);
    setLoading(true);
    setStreamingText("");

    try {
      const isTranslateStream = requestedMode === "translate";
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: requestedMode,
          text: rawText,
          targetRole,
          scenario,
          roleProfile: profile,
          trainAnswer: requestedMode === "train" && train.question ? answerDraft : undefined,
          stream: isTranslateStream
        })
      });

      const contentType = res.headers.get("Content-Type") ?? "";
      const isNdjson = contentType.includes("ndjson");

      if (isNdjson && res.ok) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("无法读取流式响应");
        const decoder = new TextDecoder();
        let buffer = "";
        const processLine = (line: string) => {
          try {
            const msg = JSON.parse(line) as { type: string; content?: string; data?: TranslateResult; error?: string };
            if (msg.type === "text" && typeof msg.content === "string") setStreamingText(msg.content);
            if (msg.type === "done" && msg.data) {
              setResult(msg.data);
              setStreamingText("");
            }
            if (msg.type === "error") throw new Error(msg.error || "流式返回失败");
          } catch (e) {
            if (e instanceof SyntaxError) return;
            throw e;
          }
        };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\n/);
          buffer = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) processLine(line);
        }
        if (buffer.trim()) processLine(buffer.trim());
        const nextPoints = stats.points + 5;
        const lvl = getLevel(nextPoints);
        setStats({ points: nextPoints, level: lvl.index });
        saveStats({ points: nextPoints, level: lvl.index });
        setLoading(false);
        return;
      }

      let data: CoachResponse | { error?: string } | null = null;
      try {
        data = (await res.json()) as any;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const message =
          (data && "error" in data && data.error) ||
          "AI 教练暂时未响应，请稍后再试。";
        throw new Error(message);
      }

      if (!data) {
        throw new Error("AI 返回内容异常，请稍后再试。");
      }

      const payload = data as CoachResponse;
      if (payload._demo) setIsDemo(true);
      if (payload.translate) setResult(payload.translate);

      setTrain(prev => ({
        ...prev,
        question: payload.trainQuestion ?? prev.question,
        lastScoreText: payload.trainScoreText ?? prev.lastScoreText
      }));

      if (requestedMode === "train" && payload.trainQuestion) {
        setAnswerDraft("");
      }

      const nextPoints = stats.points + 5;
      const lvl = getLevel(nextPoints);
      const nextStats: Stats = { points: nextPoints, level: lvl.index };
      setStats(nextStats);
      saveStats(nextStats);
    } catch (e: any) {
      setError(e.message || "出错了，请稍后重试。");
      setStreamingText("");
    } finally {
      setLoading(false);
    }
  };

  const requestNewQuestion = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "train",
          targetRole,
          scenario,
          roleProfile: profile
        })
      });
      let data: CoachResponse | { error?: string } | null = null;
      try {
        data = (await res.json()) as any;
      } catch {
        data = null;
      }
      if (!res.ok) {
        const msg = (data && "error" in data && data.error) || "获取新题目失败，请重试。";
        throw new Error(msg);
      }
      if (!data) throw new Error("返回异常，请重试。");
      const payload = data as CoachResponse;
      if (payload._demo) setIsDemo(true);
      setTrain(prev => ({
        ...prev,
        question: payload.trainQuestion ?? undefined,
        lastScoreText: undefined
      }));
      setAnswerDraft("");
      const nextPoints = stats.points + 5;
      const nextStats: Stats = { points: nextPoints, level: getLevel(nextPoints).index };
      setStats(nextStats);
      saveStats(nextStats);
    } catch (e: any) {
      setError(e.message || "出错了，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const levelLabel = LEVELS[currentLevel.index].label;
  const coachSegments = useMemo(
    () => (train.lastScoreText ? parseCoachScoreText(train.lastScoreText) : []),
    [train.lastScoreText]
  );
  const nextLevel =
    LEVELS[currentLevel.index + 1] ?? LEVELS[LEVELS.length - 1];
  const progressInLevel = useMemo(() => {
    const curr = LEVELS[currentLevel.index];
    const next = nextLevel;
    if (!next || next.threshold === curr.threshold) return 100;
    const span = next.threshold - curr.threshold;
    const delta = Math.min(
      Math.max(stats.points - curr.threshold, 0),
      span
    );
    return Math.round((delta / span) * 100);
  }, [stats.points, currentLevel.index, nextLevel]);

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="card-main">
          <div>
            <header className="header">
              <div className="brand">
                <div className="brand-badge">心</div>
                <div>
                  <div className="brand-text-main">好好说话 · AI沟通助手</div>
                  <div className="brand-text-sub">
                    让情绪被理解，而不是被放大
                  </div>
                </div>
              </div>
            </header>

            <section className="input-area">
              <div className="section-title-row">
                <span className="section-title">写下你现在想说的「原话」</span>
                <button
                  type="button"
                  className="example-fill-btn"
                  onClick={() => setRawText(EXAMPLE_RAW_TEXT)}
                >
                  用示例试试
                </button>
              </div>

              <div className="textarea-shell">
                <textarea
                  className="textarea-main"
                  placeholder={`例：${EXAMPLE_RAW_TEXT}`}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                />
                <div className="textarea-hint">先写原话，不用美化。</div>
              </div>

              <div className="filters-row">
                <div className="select-shell">
                  <span className="select-label">沟通对象</span>
                  <select
                    className="select-main"
                    value={targetRole}
                    onChange={e =>
                      setTargetRole(e.target.value as TargetRole)
                    }
                  >
                    <option value="boss">老板</option>
                    <option value="coworker">同事</option>
                    <option value="partner">伴侣</option>
                    <option value="parent">父母</option>
                    <option value="friend">朋友</option>
                  </select>
                </div>

                <div className="select-shell">
                  <span className="select-label">沟通场景</span>
                  <select
                    className="select-main"
                    value={scenario}
                    onChange={e =>
                      setScenario(e.target.value as Scenario)
                    }
                  >
                    <option value="ask">提需求 / 求助</option>
                    <option value="refuse">拒绝 / 说不</option>
                    <option value="comfort">安慰 / 支持</option>
                    <option value="complain">表达不满 / 冲突前</option>
                  </select>
                </div>
              </div>

              <input
                className="profile-input"
                placeholder="可选：一句话描述 Ta（例：怕被否定、时间很紧…）"
                value={profile}
                onChange={e => setProfile(e.target.value)}
              />

              <div className="actions-row">
                <div className="mode-toggle">
                  <button
                    className={
                      "mode-pill " +
                      (mode === "translate" ? "active" : "")
                    }
                    type="button"
                    onClick={() => setMode("translate")}
                  >
                    日常好好说话
                  </button>
                  <button
                    className={
                      "mode-pill " + (mode === "train" ? "active" : "")
                    }
                    type="button"
                    onClick={() => setMode("train")}
                  >
                    沟通训练模式
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={loading}
                    onClick={() => handleCall(mode)}
                  >
                    <span className="icon">{loading ? "…" : "✨"}</span>
                    {loading
                      ? "生成中…"
                      : mode === "translate"
                        ? "生成好好说话版"
                        : train.question
                          ? "提交打分"
                          : "生成训练题"}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#b91c1c"
                  }}
                >
                  {error}
                </div>
              )}
            </section>
          </div>

          <aside className="result-column">
            <div className="result-header-row">
              <span className="chip-soft">
                {mode === "translate" ? "情绪翻译" : "沟通训练"}
              </span>
              {isDemo && <span className="chip-demo">演示数据</span>}
            </div>

            <div className="result-card">
              {loading && !streamingText ? (
                <div className="loading-block">
                  <div className="loading-dots">
                    <span className="loading-dot" />
                    <span className="loading-dot" />
                    <span className="loading-dot" />
                  </div>
                  <p className="loading-tip">{LOADING_TIPS[loadingTip]}</p>
                </div>
              ) : mode === "translate" ? (
                <>
                  <div className="section-title">
                    好好说话版建议表达
                  </div>
                  {(result || streamingText) ? (
                    <>
                      <div className="result-text-row">
                        <p className="result-main-text">
                          {streamingText || result?.optimizedText}
                          {loading && streamingText && <span className="stream-cursor" />}
                        </p>
                        {result && !loading && (
                          <button
                            type="button"
                            className="copy-btn"
                            onClick={() => {
                              if (result.optimizedText) {
                                navigator.clipboard.writeText(result.optimizedText);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1500);
                              }
                            }}
                          >
                            {copied ? "已复制" : "复制"}
                          </button>
                        )}
                      </div>
                      {result && !loading && (
                        <>
                          <div className="scores-row">
                            <div className="score-pill">
                              <span className="score-label">怒气值</span>
                              <span className="score-value-anger">
                                {result.angerScore} / 100
                              </span>
                            </div>
                            <div className="score-pill">
                              <span className="score-label">攻击性</span>
                              <span className="score-value-attack">
                                {result.attackScore} / 100
                              </span>
                            </div>
                            <div className="score-pill">
                              <span className="score-label">共情度</span>
                              <span className="score-value-empathy">
                                {result.empathyScore} / 100
                              </span>
                            </div>
                            <div className="score-pill">
                              <span className="score-label">清晰度</span>
                              <span className="score-value-clarity">
                                {result.clarityScore} / 100
                              </span>
                            </div>
                            <div className="score-pill">
                              <span className="score-label">情绪提示</span>
                              <span>{angerTag}</span>
                            </div>
                          </div>

                          {result.theoryTips && (
                            <div className="theory-block">
                              <div className="theory-title">沟通小贴士</div>
                              <div>{result.theoryTips}</div>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div className="empty-hint">
                      输入原话 → 得到更好说出口的表达 + 评分
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="section-title">沟通训练小练习</div>
                  {train.question ? (
                    <div className="train-block">
                      <div className="train-question">
                        {train.question}
                      </div>
                      <textarea
                        className="train-answer-input"
                        placeholder="写下你会怎么说，再点左侧「提交打分」。"
                        value={answerDraft}
                        onChange={e =>
                          setAnswerDraft(e.target.value)
                        }
                      />
                      <div className="train-footer-row">
                        <div className="tiny-muted">按安全感、清晰度、需要表达评估</div>
                      </div>
                      {coachSegments.length > 0 && (
                        <div className="coach-score-block">
                          {coachSegments.map((seg, i) => (
                            <div key={i} className="coach-score-segment">
                              <div className="coach-score-title">{seg.title}</div>
                              <div className="coach-score-content">{seg.content}</div>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="secondary-btn coach-next-btn"
                            disabled={loading}
                            onClick={requestNewQuestion}
                          >
                            {loading ? "出题中…" : "再来一题"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="train-block">
                      <div className="train-question">点击左侧「生成训练题」出题，再在下方写你的话，最后点「提交打分」。</div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="stats-bar">
              <div className="stats-left">
                <div className="stats-heart">❤</div>
                <div>
                  <div className="stats-main">
                    功德值 {stats.points} · {levelLabel}
                  </div>
                  <div className="stats-sub">
                    每次使用 +5，升级解锁更多称号
                  </div>
                </div>
              </div>
              <div className="stats-progress-shell">
                <div className="stats-progress-bg">
                  <div
                    className="stats-progress-fill"
                    style={{ width: `${progressInLevel}%` }}
                  />
                </div>
                <div className="stats-label">
                  距离下一阶段「{nextLevel.label}」还有
                  {Math.max(
                    nextLevel.threshold - stats.points,
                    0
                  )}{" "}
                  点功德
                </div>
              </div>
            </div>

            <div className="footer-note">
              沟通训练 · 非暴力沟通 / 关键对话
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

