import { NextRequest, NextResponse } from "next/server";

type Mode = "translate" | "train";

type TargetRole = "boss" | "coworker" | "partner" | "parent" | "friend";

type Scenario = "ask" | "refuse" | "comfort" | "complain";

interface RequestBody {
  mode?: Mode;
  text?: string;
  targetRole?: TargetRole;
  scenario?: Scenario;
  roleProfile?: string;
  trainAnswer?: string;
  /** 情绪翻译时为 true 则流式返回，先显示优化句再显示评分 */
  stream?: boolean;
}

interface TranslateResult {
  optimizedText: string;
  angerScore: number;
  attackScore: number;
  empathyScore: number;
  clarityScore: number;
  explanation?: string;
  theoryTips?: string;
}

interface ResponseBody {
  mode: Mode;
  translate?: TranslateResult;
  trainQuestion?: string;
  trainScoreText?: string;
  _demo?: boolean;
}

// 无 API Key 时返回演示数据，方便简历/面试演示完整体验
function getMockTranslate(_text: string): TranslateResult {
  return {
    optimizedText: `我注意到这件事让我有点着急，想和你确认一下进度，看咱们能不能一起把接下来要做的对齐清楚。`,
    angerScore: 15,
    attackScore: 12,
    empathyScore: 78,
    clarityScore: 82,
    explanation: `把对「人」的指责改成了对「事」的关切，用「我」表达感受和需求。`,
    theoryTips: `先描述事实与感受，再提出具体请求，对方更容易听见。`
  };
}

const MOCK_TRAIN_QUESTIONS = [
  `场景：伴侣最近总加班，答应好的周末约会又临时取消，你有点委屈也有点生气。请写一句你可能会发给 Ta 的话（不必客气，写真实想法即可）。`,
  `场景：老板临时加活，你手头已经排满，又不好直接拒绝。请写一句你会怎么跟老板说的话。`,
  `场景：朋友向你借钱，你不想借又怕伤感情。请写一句你会怎么回复。`
];

function getMockTrainQuestion(): string {
  const i = Math.floor(Math.random() * MOCK_TRAIN_QUESTIONS.length);
  return MOCK_TRAIN_QUESTIONS[i];
}

function getMockTrainScore(): string {
  return `【总体】既有边界又有温度。\n【亮点】用了「我」的感受、没有贴标签。\n【可优化】可以加一句具体的小请求（比如「下次能不能提前说一声」），对方更容易行动。\n【关联】符合非暴力沟通「观察-感受-需要-请求」四步。`;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

function getAiConfig(): { key: string; baseUrl: string; model: string } | null {
  if (DEEPSEEK_API_KEY) {
    return {
      key: DEEPSEEK_API_KEY,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat"
    };
  }
  if (OPENAI_API_KEY) {
    return {
      key: OPENAI_API_KEY,
      baseUrl: "https://api.openai.com",
      model: "gpt-4.1-mini"
    };
  }
  return null;
}

const SYSTEM_PROMPT = `你是「非暴力沟通 & 关键对话」沟通教练。原则：关系安全、信息清晰；保留诉求、降攻击性；多用「我」少用「你」；观察-感受-需要-请求。

translate：把情绪化句子改写成温和清晰版（中文、自然、可复制），并给怒气/攻击性/共情/清晰度 0-100 分 + 一句说明 + 1～2 条理论小贴士。
train：无答案时出题（对象+场景+对方特点，具体到「一句话怎么说」）；有答案时点评：总体 + 亮点 + 可优化 + 关联原则。输出温暖、简短、可直接用。`;

async function callAI(prompt: string): Promise<any> {
  const config = getAiConfig();
  if (!config) {
    return null; // 由调用方走演示数据
  }

  const url = `${config.baseUrl}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.key}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("AI API error:", text);
    throw new Error("AI 服务暂时不可用，请稍后再试。");
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return content;
}

/** 流式调用 AI，逐 token 产出 content */
async function* callAIStream(prompt: string): AsyncGenerator<string> {
  const config = getAiConfig();
  if (!config) return;

  const url = `${config.baseUrl}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.key}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      stream: true
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("AI API stream error:", text);
    throw new Error("AI 服务暂时不可用，请稍后再试。");
  }

  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(trimmed.slice(6));
          const content = data.choices?.[0]?.delta?.content;
          if (typeof content === "string") yield content;
        } catch {
          // 忽略单条解析失败
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const STREAM_TRANSLATE_PROMPT_PREFIX = `格式（不要其他文字）：第一行=优化后一句（无引号无换行）；第二行=---；第三行起=JSON：angerScore,attackScore,empathyScore,clarityScore(0-100),explanation,theoryTips。`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const mode: Mode = body.mode ?? "translate";

    if (mode === "translate") {
      const text = (body.text ?? "").trim();
      if (!text) {
        return NextResponse.json(
          { error: "请输入你真实想说的那句话。" },
          { status: 400 }
        );
      }

      const wantStream = body.stream === true && getAiConfig();
      if (wantStream) {
        const userPrompt = `${STREAM_TRANSLATE_PROMPT_PREFIX}

原始表达：${text}
沟通对象：${body.targetRole ?? "未指定"}，场景：${body.scenario ?? "未指定"}，对方特点：${body.roleProfile ?? "未补充"}`;
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const sep = "\n---\n";
            try {
              let full = "";
              let firstLineSent = "";
              let restMode = false;
              let restBuffer = "";
              let firstLineFinal = "";
              for await (const chunk of callAIStream(userPrompt)) {
                if (restMode) {
                  restBuffer += chunk;
                  continue;
                }
                full += chunk;
                const idx = full.indexOf(sep);
                if (idx === -1) {
                  const partialFirst = full.split("\n")[0]?.trim() ?? "";
                  if (partialFirst && partialFirst !== firstLineSent) {
                    firstLineSent = partialFirst;
                    controller.enqueue(encoder.encode(JSON.stringify({ type: "text", content: partialFirst }) + "\n"));
                  }
                  continue;
                }
                firstLineFinal = full.slice(0, idx).trim();
                controller.enqueue(encoder.encode(JSON.stringify({ type: "text", content: firstLineFinal }) + "\n"));
                restBuffer = full.slice(idx + sep.length);
                restMode = true;
              }
              const rest = restMode ? restBuffer : full;
              const toParse = rest.trim();
              const jsonMatch = toParse.match(/\{[\s\S]*\}/);
              let parsed: TranslateResult;
              if (jsonMatch) {
                try {
                  const obj = JSON.parse(jsonMatch[0]);
                  parsed = {
                    optimizedText: firstLineFinal || (obj.optimizedText ?? toParse),
                    angerScore: Number(obj.angerScore) || 0,
                    attackScore: Number(obj.attackScore) || 0,
                    empathyScore: Number(obj.empathyScore) || 0,
                    clarityScore: Number(obj.clarityScore) || 0,
                    explanation: obj.explanation,
                    theoryTips: obj.theoryTips
                  };
                } catch {
                  parsed = { optimizedText: firstLineFinal || toParse, angerScore: 0, attackScore: 0, empathyScore: 0, clarityScore: 0 };
                }
              } else {
                parsed = { optimizedText: firstLineFinal || toParse, angerScore: 0, attackScore: 0, empathyScore: 0, clarityScore: 0 };
              }
              controller.enqueue(encoder.encode(JSON.stringify({ type: "done", data: parsed, _demo: false }) + "\n"));
            } catch (err: any) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: err?.message || "流式返回失败" }) + "\n"));
            } finally {
              controller.close();
            }
          }
        });
        return new Response(stream, {
          headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" }
        });
      }

      const userPrompt = `情绪翻译。原话：${text}\n对象：${body.targetRole ?? "未指定"} 场景：${body.scenario ?? "未指定"} 对方：${body.roleProfile ?? "未补充"}\n只返回一个 JSON：{"optimizedText":"...","angerScore":0-100,"attackScore":0-100,"empathyScore":0-100,"clarityScore":0-100,"explanation":"一句说明","theoryTips":"1-2条小贴士"}`;

      const raw = await callAI(userPrompt);
      let parsed: TranslateResult | null = null;
      if (!getAiConfig() || raw == null) {
        parsed = getMockTranslate(text);
      } else {
        try {
          parsed = JSON.parse(raw);
        } catch {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        }
      }
      if (!parsed) {
        throw new Error("AI 返回内容解析失败，请重试。");
      }
      const response: ResponseBody = {
        mode: "translate",
        translate: parsed,
        _demo: !getAiConfig()
      };
      return NextResponse.json(response);
    }

    // 训练模式
    const target = body.targetRole ?? "partner";
    const scene = body.scenario ?? "complain";
    const profile = body.roleProfile ?? "未补充";

    if (!body.trainAnswer) {
      // 出题
      const userPrompt = `出题：对象${target}，场景${scene}，对方${profile}。要具体（时间/地点/状态），让来访者写一句会发出去的话。一段描述+问题引导。`;

      const questionRaw = await callAI(userPrompt);
      const question = questionRaw ? String(questionRaw) : getMockTrainQuestion();

      const response: ResponseBody = {
        mode: "train",
        trainQuestion: question,
        _demo: !getAiConfig()
      };
      return NextResponse.json(response);
    }

    // 对答案评分
    const answer = (body.trainAnswer ?? "").trim();
    if (!answer) {
      return NextResponse.json(
        { error: "请先写一句你会说的话再提交打分。" },
        { status: 400 }
      );
    }

    const userPrompt = `点评练习。对象${target}场景${scene}对方${profile}。表达：${answer}\n按四段输出，每段【标题】开头换行：【总体】一句；【亮点】2～3点；【可优化】2～3点+改写示例；【关联】一句原则。只输出这四段。`;

    const scoreRaw = await callAI(userPrompt);
    const scoreText = scoreRaw ? String(scoreRaw) : getMockTrainScore();

    const response: ResponseBody = {
      mode: "train",
      trainScoreText: scoreText,
      _demo: !getAiConfig()
    };
    return NextResponse.json(response);
  } catch (err: any) {
    console.error("coach api error:", err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          "内部错误：沟通教练暂时下线了，请稍后再试。"
      },
      { status: 500 }
    );
  }
}

