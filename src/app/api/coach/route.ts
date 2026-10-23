import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type Mode = "translate" | "train";

type TargetRole = "boss" | "coworker" | "partner" | "parent" | "friend" | "child";

type Scenario = "ask" | "refuse" | "comfort" | "complain" | "report";

interface RequestBody {
  mode?: Mode;
  text?: string;
  targetRole?: TargetRole;
  scenario?: Scenario;
  roleProfile?: string;
  trainAnswer?: string;
  trainQuestion?: string;
  previousQuestion?: string;
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

/** 记录每次提问到本地文件（仅当 LOG_REQUESTS_PATH 已配置时，适合 ECS 等有持久化磁盘的环境） */
function appendRequestLog(entry: Record<string, unknown>) {
  const logPath = process.env.LOG_REQUESTS_PATH;
  if (!logPath) return;
  try {
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // 忽略写入失败（如 Vercel 无持久化）
  }
}

// Demo responses are preset examples and explicitly labelled by the client.
function getMockTranslate(_text: string, role?: TargetRole, scene?: Scenario): TranslateResult {
  const optimizedText = role === "child"
    ? "我们之前约好了玩完收好玩具。我希望客厅能留出走路的地方，你想先收积木还是先收小车？我可以陪你一起开始。"
    : scene === "report"
      ? "目前核心流程已完成。新增需求会影响原定上线时间，需要一起确认本次上线的优先级：优先保证原定范围按时交付，还是调整时间把新需求一并完成？确认后我会同步更新计划。"
      : scene === "refuse"
        ? "我理解这个需求比较紧急。目前手上的任务已经排满，如果今天优先处理它，原定工作需要相应顺延。我们能先一起确认优先级和交付范围吗？"
        : "我注意到这件事让我有点着急，想和你确认一下进度，看咱们能不能一起把接下来要做的对齐清楚。";
  return {
    optimizedText, angerScore: 15, attackScore: 12, empathyScore: 78, clarityScore: 82,
    explanation: "把对人的指责转成对事情的描述，同时保留具体诉求。",
    theoryTips: "说明发生了什么、你在意什么，再提出对方可以回应的具体请求。"
  };
}
const ROLE_LABELS: Record<TargetRole, string> = {
  boss: "老板", coworker: "同事", partner: "伴侣", parent: "父母", child: "孩子", friend: "朋友"
};
const MOCK_QUESTIONS: Record<TargetRole, Record<Scenario, string>> = {
  boss: {
    ask: "项目进入验收阶段，你需要老板协调另一团队投入半天时间支持测试。你会怎样提出这个请求？",
    report: "明天是项目关键节点汇报。核心功能已完成，新增需求可能影响原定上线日期，你需要老板确认优先级。你会如何开场？",
    refuse: "老板临时安排了一个今天交付的新任务，但你已有两项紧急工作。你会怎样说明负荷并讨论取舍？",
    complain: "老板连续两次在临近交付时调整范围，影响了团队安排。你想讨论一个更明确的变更流程，会怎样表达？",
    comfort: "一个重要项目延期，老板在复盘会上显得疲惫和自责。会后你想表达理解并提供具体支持，你会怎样说？"
  },
  coworker: {
    ask: "明天下午要做方案评审，你需要同事今天下班前补充一组关键数据。你会怎样提出请求并确认时间？",
    report: "你和同事共同推进的功能已完成主要流程，但还差联调。你要同步进展并对齐明天的分工，会怎样说？",
    refuse: "同事临时请你今天帮忙做一份分析，但你正在处理一个必须按时交付的任务。你会怎样回复？",
    complain: "同事连续两次没有提前通知就更改了接口，导致你返工。你希望后续变更前先同步，会怎样表达？",
    comfort: "同事准备了很久的方案没有通过评审，正在怀疑自己的能力。你会怎样回应并提供支持？"
  },
  partner: {
    ask: "最近晚饭后的家务大多由你承担。今晚你想和伴侣商量重新分配，你会怎样开口？",
    report: "你们正在共同准备一次搬家。你已联系好搬家公司，但打包进度落后。你想和伴侣对齐接下来的分工，会怎样说？",
    refuse: "伴侣想周末一起参加聚会，但你这周很疲惫，希望留半天独处。你会怎样表达这个安排？",
    complain: "伴侣临时取消了约好的周末活动，你有些失落，希望以后计划变化时能提前商量。你会怎样说？",
    comfort: "伴侣今天工作不顺，回家后说自己什么都做不好。你会怎样回应，让对方感受到理解？"
  },
  parent: {
    ask: "你想请父母来做客前先和你确认时间，方便安排工作和休息。你会怎样提出这个请求？",
    report: "你最近在考虑换工作，已经做了调研但还没决定。你想向父母同步进展和自己的考虑，会怎样表达？",
    refuse: "父母希望你参加一个已经替你答应的聚会，但你已有安排。你会怎样说明并表达自己的边界？",
    complain: "父母最近多次把你的私人近况告诉亲戚，你希望这些信息先征得你的同意。你会怎样沟通？",
    comfort: "父母因为一次体检结果等待而有些紧张，正在反复担心。你会怎样表达陪伴和支持？"
  },
  child: {
    ask: "晚上八点，孩子玩完积木还没收拾。你们之前约好了玩完归位，你希望先理解他的想法，再提出明确请求。你会怎样说？",
    report: "你和孩子约好了周末一起完成一个手工作品，现在已经做完一半。你想和孩子聊聊进度，并一起决定下一步，会怎样说？",
    refuse: "睡前孩子还想再玩半小时平板，你们事先约好的时间已经到了。你会怎样坚持约定，同时回应他的失望？",
    complain: "你在开会时，孩子几次大声打断。会后你想听听他当时需要什么，也说明下次的约定。你会怎样开口？",
    comfort: "孩子今天和朋友闹了矛盾，回家后很难过，说没人愿意和自己玩。你会怎样回应他的感受？"
  },
  friend: {
    ask: "你正在准备一个重要面试，想请朋友抽十五分钟帮你听一遍介绍。你会怎样提出请求？",
    report: "你和朋友共同组织一次周末活动，场地已经订好，但人数还没确认。你想同步进展并商量分工，会怎样说？",
    refuse: "朋友邀请你参加一个预算较高的旅行，你这段时间想控制支出。你会怎样回复？",
    complain: "朋友最近几次赴约都迟到了半小时，你希望下次能提前沟通。你会怎样表达自己的感受和期待？",
    comfort: "朋友最近求职不顺，觉得自己的努力没有结果。你会怎样回应，让对方感受到支持？"
  }
};
const ALTERNATE_QUESTIONS: Record<Scenario, string> = {
  ask: "你准备邀请对方参与一件共同的事情，但双方还没约定时间和分工。你会怎样表达具体请求，并留出商量的空间？",
  report: "你们之前约定的一件事情出现了新的进展，同时有一项安排需要调整。你会怎样讲清已完成的部分、变化和下一步？",
  refuse: "对方希望你答应一件事情，但你已经有重要安排。你会怎样表达边界，并说明自己能够提供的支持？",
  complain: "一件你很在意的事没有按双方的约定进行。你会怎样描述事实、说明自己的感受，并讨论下一次的做法？",
  comfort: "对方因为最近的一次挫折感到失落。你会怎样先理解感受，再询问对方需要怎样的支持？"
};
function getMockTrainQuestion(role: TargetRole, scene: Scenario, previous?: string): string {
  const question = MOCK_QUESTIONS[role]?.[scene] ?? MOCK_QUESTIONS.partner.complain;
  return previous === question
    ? "沟通对象：" + (ROLE_LABELS[role] ?? "伴侣") + "。" + (ALTERNATE_QUESTIONS[scene] ?? ALTERNATE_QUESTIONS.complain)
    : question;
}
function getMockTrainScore(): string {
  return "【总体】清楚表达诉求，同时给对方留出回应的空间，是值得练习的方向。\n【亮点】可以关注表达中是否有具体事实、自己的感受和明确期待。\n【可优化】试着补上一句可回应的请求，比如“我们可以一起确认接下来的安排吗？”。\n【关联】对应非暴力沟通中的观察、感受、需要与请求。";
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

const SYSTEM_PROMPT = [
  "你是非暴力沟通与关键对话教练。关系安全、信息清晰，保留立场与诉求，减少指责。参考观察-感受-需要-请求，表达自然，避免机械套用。",
  "对象 boss/coworker/partner/parent/child/friend 分别是老板/同事/伴侣/父母/子女/朋友。场景 ask/refuse/comfort/complain/report 分别是提需求/拒绝/安慰/表达不满/汇报对齐。",
  "translate：给出可直接使用的中文表达、怒气/攻击性/共情/清晰度0-100分、一句说明及1-2条小贴士。汇报强调重点、风险和需要的决策；亲子沟通尊重感受并清晰表达约定。",
  "train：无答案时按对象和场景出一道具体练习题；有答案时结合原练习题点评，按【总体】【亮点】【可优化】【关联】分段。避免迎合、羞辱或替用户虚构事实。"
].join("\n");

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
        appendRequestLog({
          t: new Date().toISOString(),
          mode: "translate",
          text: text,
          targetRole: body.targetRole ?? null,
          scenario: body.scenario ?? null,
          profile: (body.roleProfile ?? "") || null
        });
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
        parsed = getMockTranslate(text, body.targetRole, body.scenario);
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
      appendRequestLog({
        t: new Date().toISOString(),
        mode: "translate",
        text: text,
        targetRole: body.targetRole ?? null,
        scenario: body.scenario ?? null,
        profile: (body.roleProfile ?? "") || null
      });
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

    if (body.trainAnswer === undefined) {
      // 出题
      const userPrompt = `出题：对象${target}，场景${scene}，对方${profile}。要具体（时间/地点/状态），让来访者写一句会发出去的话。一段描述+问题引导。`;

      const questionRaw = await callAI(userPrompt);
      const question = questionRaw ? String(questionRaw) : getMockTrainQuestion(target, scene, body.previousQuestion);

      appendRequestLog({
        t: new Date().toISOString(),
        mode: "train",
        action: "question",
        targetRole: target,
        scenario: scene,
        profile: profile || null
      });
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

    const scoreRaw = await callAI(userPrompt + "\n原练习题：" + (body.trainQuestion ?? "未提供"));
    const scoreText = scoreRaw ? String(scoreRaw) : getMockTrainScore();

    appendRequestLog({
      t: new Date().toISOString(),
      mode: "train",
      action: "score",
      targetRole: target,
      scenario: scene,
      profile: profile || null,
      trainAnswer: answer
    });
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

