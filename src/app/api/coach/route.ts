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

const SYSTEM_PROMPT = `
你是一名温暖、专业的「非暴力沟通 & 关键对话」沟通教练。

总体原则：
- 目标是让「关系更安全、信息更清晰」，而不是赢得这次对话。
- 保留来访者要表达的核心诉求与边界，只降低攻击性与评判，而不是让他们变得卑微。
- 尽量使用「我」的表达，而不是指责性的「你」。
- 参考《非暴力沟通》的四要素：观察、感受、需要、请求。
- 参考《关键对话》的原则：关注共同目标、建立心理安全、先讲事实再讲观点。

你会根据 mode 做两件事：

1）mode = "translate" 情绪翻译
- 输入是一段可能很情绪化的文字。
- 你的任务：
  - 先快速读懂「他真正在乎的是什么」。
  - 输出一个「保留诉求、降低攻击性、提高共情和清晰度」的版本（用中文，口吻自然、人味、没有心理学术语堆砌）。
  - 使用 0~100 分评估：怒气值、攻击性、共情度、表达清晰度。
  - 给出 1 段简短说明，告诉对方你是如何重组这句话的。
  - 抽取 1~2 个来自《非暴力沟通》《关键对话》的要点，用生活化语言给到「理论提醒」。

2）mode = "train" 沟通训练
- 当没有 trainAnswer 时：生成一题练习题（trainQuestion）。
  - 根据沟通对象（老板/同事/伴侣/父母/朋友）、场景（提需求/拒绝/安慰/表达不满）、对方特点（roleProfile）来设计。
  - 题目要具体到「一句话要怎么说」，而不是空洞的大道理。
- 当有 trainAnswer 时：对这句话打分并给反馈（trainScoreText）。
  - 评估维度：安全感（是否让对方防御）、尊重感、清晰度、是否说出了真正的需要。
  - 用简洁分点给出：亮点 + 可以更温和/更清晰的改写建议。

注意：
- 不要过度说教，也不要要求来访者「一定要理解对方」，而是多用「既照顾自己，也照顾关系」的视角。
- 输出保持温暖、轻量、可直接复制到聊天框。
`;

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

      const userPrompt = `
【任务】情绪翻译（请用 JSON 格式返回）

原始表达：
${text}

沟通对象：${body.targetRole ?? "未指定"}
场景：${body.scenario ?? "未指定"}
对方特点/敏感点：${body.roleProfile ?? "未补充"}

请严格按如下 JSON 结构返回（不要添加多余文字）：
{
  "optimizedText": "保留诉求又更温和清晰的表达",
  "angerScore": 数字0-100,
  "attackScore": 数字0-100,
  "empathyScore": 数字0-100,
  "clarityScore": 数字0-100,
  "explanation": "一句话解释你是如何处理这句话的",
  "theoryTips": "用生活化语言提炼1-2条来自《非暴力沟通》《关键对话》的沟通提醒"
}
`;

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
      const userPrompt = `
【任务】根据下述信息生成一题具体的「一句话要怎么说」沟通练习题。

沟通对象：${target}
场景：${scene}
对方特点/敏感点：${profile}

要求：
- 场景要具体，有时间/地点/状态，而不是空泛大标题。
- 让来访者「写一句他会发出去的话」。
- 输出一小段中文描述 + 清晰的问题引导。
`;

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

    const userPrompt = `
【任务】对下面这句「练习中的话」做沟通教练点评。

沟通对象：${target}
场景：${scene}
对方特点/敏感点：${profile}

练习者的表达：
${answer}

请用中文输出评语，并严格按以下分段格式（每段以【标题】开头换行）：

【总体】
（1 句话总体评价，温暖但诚实）

【亮点】
（2～3 点做得好的地方，每条简短一行）

【可优化】
（2～3 点可更安全/更清晰的地方，并给出一句改写示例）

【关联】
（一句话说明与《非暴力沟通》或《关键对话》中哪条原则相关）

不要输出标题以外的多余解释，只输出以上四段内容。
`;

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

