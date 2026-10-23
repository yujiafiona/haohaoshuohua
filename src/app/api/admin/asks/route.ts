import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

const MAX_ENTRIES = 500;

export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "未配置 ADMIN_SECRET" }, { status: 500 });
  }
  const provided =
    req.nextUrl.searchParams.get("secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const logPath = process.env.LOG_REQUESTS_PATH;
  if (!logPath || !fs.existsSync(logPath)) {
    return NextResponse.json({ entries: [] });
  }

  try {
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.split(/\n/).filter(Boolean);
    const parsed: Record<string, unknown>[] = [];
    for (let i = lines.length - 1; i >= 0 && parsed.length < MAX_ENTRIES; i--) {
      try {
        parsed.push(JSON.parse(lines[i]) as Record<string, unknown>);
      } catch {
        // 跳过非法行
      }
    }
    return NextResponse.json({ entries: parsed });
  } catch (e) {
    console.error("admin asks read error:", e);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}
