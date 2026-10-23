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

// Preset demonstrations cover both dimensions; they do not rewrite arbitrary input.
const MOCK_TRANSLATIONS: Record<TargetRole, Record<Scenario, string>> = {
  boss: {
    ask: "为了按时完成这次交付，我需要协调测试支持。您方便帮忙确认可投入的人力和时间吗？我会据此更新计划。",
    report: "目前核心流程已完成，新增需求会影响原定上线时间。想请您确认本次上线的优先级：先保证原定范围按时交付，还是调整时间纳入新需求？确认后我会更新计划。",
    refuse: "我目前的任务已经排满，今天直接增加这个需求会影响原定交付。想请您确认它与现有任务的优先级，再决定哪些安排需要调整。",
    complain: "最近两次临近交付时调整范围，影响了团队的排期。我希望后续变更能先一起评估影响，再确认优先级和交付时间，您看这样是否可行？",
    comfort: "这次延期确实不容易。我愿意协助梳理目前的卡点，您希望我先整理待解决的问题，还是先协调后续安排？"
  },
  coworker: {
    ask: "方案评审还需要补充一组数据。你今天下班前方便整理给我吗？如果时间有冲突，我们可以一起确认可行的范围。",
    report: "核心流程已经完成，新增需求会影响原定时间。我们先对齐本次上线的优先级和分工，再一起确认哪些内容需要调整排期，好吗？",
    refuse: "我手上的任务已经排满，今天没法直接接下这个需求。我们可以先对齐优先级；如果它需要先做，就一起确认现有工作怎么调整。",
    complain: "最近两次接口变更没有提前同步，我这边需要重新调整。以后变更前，我们能先确认影响范围和时间吗？这样双方都更好安排。",
    comfort: "准备了这么久却没通过评审，确实会失落。你想先聊聊，还是一起看看评审意见？我可以陪你梳理。"
  },
  partner: {
    ask: "最近晚饭后的家务让我有些疲惫，我希望我们都能有休息的时间。今晚可以一起商量一下分工吗？",
    report: "核心流程已经完成了，不过新增需求会影响原定时间。我想先把这次上线最重要的目标理清楚，也想听听你的想法，我们一起商量一下好吗？",
    refuse: "我知道你希望这件事今天完成，但我手上的事情已经排满了，今天没法再接下来。我们一起看看什么最重要，再商量哪些安排可以往后挪，好吗？",
    complain: "约好的活动临时取消，我有些失落，因为我很期待我们一起的时间。以后计划有变化时，可以早点和我商量吗？",
    comfort: "听起来今天的事让你很受挫。我在这里，你想说说发生了什么，还是希望我先陪你待一会儿？"
  },
  parent: {
    ask: "我很欢迎你们来家里坐坐，也想把工作和休息安排好。下次来之前，能先和我确认一下时间吗？",
    report: "想跟你们说一下最近的进展：核心流程已经完成，不过新增加的内容可能影响原定时间。我会先确认这次最重要的目标，再调整后面的安排。",
    refuse: "我知道你们希望事情早点做好，但我目前的安排已经满了，今天没法再加进来。我会先把事情的轻重缓急理清，再和你们说能安排的时间。",
    complain: "我知道你们关心我的近况，不过有些事情我想自己决定什么时候告诉亲戚。下次分享前，能先问一下我的想法吗？",
    comfort: "等待结果的时候，心里不踏实很正常。你们愿意说说最担心的是什么吗？我可以陪着一起等，也可以一起整理要问的问题。"
  },
  child: {
    ask: "我们约好了玩完收好玩具。你想先收积木还是先收小车？如果开始有点难，我可以陪你一起收第一件。",
    report: "这件事最主要的一部分已经做好了，不过新加的内容还需要时间。我们先一起看看最重要的是什么，再决定接下来怎么做，好吗？",
    refuse: "我知道你希望今天就把这件事做好，但我今天已经有安排，不能再答应更多事情。我们可以一起看看先做哪一件，再约好其他事情的时间。",
    complain: "刚才我开会时被打断，没能听清别人的话。我想知道你当时需要什么，我们也一起约好，下次怎么让我知道，好吗？",
    comfort: "和朋友闹矛盾，你现在一定很难过。你想先抱一抱，还是跟我说说发生了什么？我会听你说。"
  },
  friend: {
    ask: "我正在准备一个重要面试，想找人帮我听一遍介绍。你这周方便留十五分钟吗？时间不合适也可以直接告诉我。",
    report: "跟你同步一下，核心流程已经做完了，新加的内容可能会影响原定时间。我想先确认这次上线最重要的目标，再决定接下来怎么安排，你怎么看？",
    refuse: "我手上的事情已经排满了，今天确实帮不上这个新需求。咱们可以先聊聊最急的是哪部分，再看看有没有别的时间或办法。",
    complain: "最近几次见面我都等了半小时，有些着急，也会影响后面的安排。下次如果会晚到，可以提前和我说一声吗？",
    comfort: "这段时间求职不顺，难免会觉得泄气。你想先吐槽一下，还是一起看看接下来能试什么？我都愿意陪你。"
  }
};
function getMockTranslate(role: TargetRole, scene: Scenario): TranslateResult {
  const optimizedText = MOCK_TRANSLATIONS[role][scene];
  return {
    optimizedText, angerScore: 15, attackScore: 12, empathyScore: 78, clarityScore: 82,
    explanation: ROLE_GUIDANCE[role],
    theoryTips: "说明发生了什么、你在意什么，再提出对方可以回应的具体请求。"
  };
}
const ROLE_LABELS: Record<TargetRole, string> = {
  boss: "老板", coworker: "同事", partner: "伴侣", parent: "父母", child: "孩子", friend: "朋友"
};
const ROLE_GUIDANCE: Record<TargetRole, string> = {
  boss: "面向老板：先结论，再说明影响、取舍与需要确认的决策；专业直接，避免过度示弱。",
  coworker: "面向同事：平等协商，明确协作范围、分工与可回应的请求，避免命令口吻。",
  partner: "面向伴侣：自然亲近，表达自己的感受和需要，邀请共同商量，避免公文或上下级汇报口吻。",
  parent: "面向父母：尊重而坚定，用日常语言说明自己的考虑与边界，避免说教或无条件顺从。",
  child: "面向孩子：用简单具体、孩子能理解的话回应感受、说明边界与可执行的下一步，避免职场术语和羞辱。",
  friend: "面向朋友：自然坦诚，明确自己的想法，也给对方选择空间，避免过度客套。"
};
const SCENARIO_LABELS: Record<Scenario, string> = {
  ask: "提需求 / 寻求支持", refuse: "拒绝 / 表达边界", comfort: "安慰 / 提供支持",
  complain: "表达不满 / 讨论分歧", report: "汇报进展 / 对齐预期"
};
function translateContext(body: RequestBody): string {
  const role = body.targetRole ?? "coworker";
  const scene = body.scenario ?? "ask";
  return [
    `当前沟通对象：${ROLE_LABELS[role]}（${role}）。${ROLE_GUIDANCE[role]}`,
    `当前沟通目的：${SCENARIO_LABELS[scene]}。`,
    `对方特点或背景：${body.roleProfile?.trim() || "未补充"}`,
    "以本次选择的对象和目的调整称呼、语气和请求方式，不能只替换称呼。原话中的人物、事件、立场和关键事实必须保留；即使场景与对象不常见，也不要擅自换成其他故事或编造事实。"
  ].join("\n");
}
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
    if (body.targetRole !== undefined && !Object.hasOwn(ROLE_LABELS, body.targetRole)) {
      return NextResponse.json({ error: "请选择有效的沟通对象。" }, { status: 400 });
    }
    if (body.scenario !== undefined && !Object.hasOwn(SCENARIO_LABELS, body.scenario)) {
      return NextResponse.json({ error: "请选择有效的沟通场景。" }, { status: 400 });
    }

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
${translateContext(body)}`;
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

      const userPrompt = `情绪翻译。原话：${text}\n${translateContext(body)}\n只返回一个 JSON：{"optimizedText":"...","angerScore":0-100,"attackScore":0-100,"empathyScore":0-100,"clarityScore":0-100,"explanation":"一句说明","theoryTips":"1-2条小贴士"}`;

      const raw = await callAI(userPrompt);
      let parsed: TranslateResult | null = null;
      if (!getAiConfig() || raw == null) {
        parsed = getMockTranslate(body.targetRole ?? "coworker", body.scenario ?? "ask");
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

