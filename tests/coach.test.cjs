const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const roles = ["boss", "coworker", "partner", "parent", "child", "friend"];
const labels = ["老板", "同事", "伴侣", "父母", "孩子", "朋友"];
const scenes = ["ask", "refuse", "comfort", "complain", "report"];
const examples = [
  "这个需求又要今天上线？我手上的事情已经排满了，能不能先把优先级说清楚？",
  "目前核心流程已经完成，但新加的需求会影响原定时间。我需要先确认这次上线最重要的目标。",
  "说好玩完就收拾玩具，怎么每次都要我提醒？"
];
const fixture = { optimizedText: "测试改写", angerScore: 10, attackScore: 5, empathyScore: 80, clarityScore: 90 };

// Exercise the actual route with isolated environment and a deterministic model transport.
function loadRoute(realAI = false) {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/api/coach/route.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;
  const captured = [];
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module,
    require: name => name === "next/server" ? { NextResponse: { json: Response.json } } : require(name),
    process: { env: realAI ? { OPENAI_API_KEY: "test-only-key" } : {} },
    console, Response, ReadableStream, TextEncoder, TextDecoder,
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      captured.push(body);
      if (!body.stream) return Response.json({ choices: [{ message: { content: JSON.stringify(fixture) } }] });
      const content = fixture.optimizedText + "\n---\n" + JSON.stringify(fixture);
      return new Response("data: " + JSON.stringify({ choices: [{ delta: { content } }] }) + "\n\ndata: [DONE]\n\n");
    }
  });
  return { POST: module.exports.POST, captured };
}
const request = body => new Request("http://localhost/api/coach", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});

test("demo changes with each role and scenario, including stream requests", async () => {
  const { POST, captured } = loadRoute();
  for (const stream of [false, true]) {
    const perRole = new Map(roles.map(role => [role, new Set()]));
    for (const scenario of scenes) {
      const results = new Set();
      for (const targetRole of roles) {
        const response = await POST(request({ mode: "translate", text: examples[0], targetRole, scenario, stream }));
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data._demo, true);
        assert.ok(data.translate.optimizedText.length > 20);
        results.add(data.translate.optimizedText);
        perRole.get(targetRole).add(data.translate.optimizedText);
      }
      assert.equal(results.size, roles.length, "roles must not share the same canned wording: " + scenario);
    }
    for (const variants of perRole.values()) assert.equal(variants.size, scenes.length);
  }
  assert.equal(captured.length, 0, "demo must not call a provider");
});

test("each example sends the newly selected role, facts and background to both model paths", async () => {
  const { POST, captured } = loadRoute(true);
  for (const text of examples) for (const stream of [false, true]) {
    for (const [i, targetRole] of roles.entries()) {
      const response = await POST(request({ mode: "translate", text, targetRole, scenario: "refuse", roleProfile: "希望先听结论", stream }));
      assert.equal(response.status, 200);
      if (stream) {
        const events = (await response.text()).trim().split("\n").map(JSON.parse);
        const done = events.find(event => event.type === "done");
        assert.equal(done._demo, false);
        assert.equal(done.data.optimizedText, fixture.optimizedText);
      } else {
        const data = await response.json();
        assert.equal(data._demo, false);
        assert.equal(data.translate.optimizedText, fixture.optimizedText);
      }
      const call = captured.at(-1);
      const prompt = call.messages.find(message => message.role === "user").content;
      assert.ok(prompt.includes(text), "original facts must reach the provider");
      assert.ok(prompt.includes("当前沟通对象：" + labels[i] + "（" + targetRole + "）"));
      assert.ok(prompt.includes("当前沟通目的：拒绝 / 表达边界"));
      assert.ok(prompt.includes("希望先听结论"));
      assert.ok(prompt.includes("不能只替换称呼"));
      assert.ok(prompt.includes("不要擅自换成其他故事或编造事实"));
      assert.equal(Boolean(call.stream), stream);
    }
  }
  assert.equal(captured.length, 36);
});

test("unknown role/scene is rejected instead of selecting an unrelated preset", async () => {
  const { POST } = loadRoute();
  for (const invalid of [{ targetRole: "unknown" }, { targetRole: "__proto__" }, { scenario: "unknown" }]) {
    const response = await POST(request({ mode: "translate", text: examples[0], ...invalid }));
    assert.equal(response.status, 400);
  }
  const defaults = await (await POST(request({ text: examples[0] }))).json();
  const explicit = await (await POST(request({ text: examples[0], targetRole: "coworker", scenario: "ask" }))).json();
  assert.equal(defaults.translate.optimizedText, explicit.translate.optimizedText);
});
