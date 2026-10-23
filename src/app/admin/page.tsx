"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const ROLE_LABEL: Record<string, string> = {
  boss: "老板",
  coworker: "同事",
  partner: "伴侣",
  parent: "父母",
  friend: "朋友"
};
const SCENARIO_LABEL: Record<string, string> = {
  ask: "提需求/求助",
  refuse: "拒绝/说不",
  comfort: "安慰/支持",
  complain: "表达不满/冲突前"
};

interface LogEntry {
  t?: string;
  mode?: string;
  action?: string;
  targetRole?: string | null;
  scenario?: string | null;
  profile?: string | null;
  text?: string | null;
  trainAnswer?: string | null;
}

export default function AdminPage() {
  const searchParams = useSearchParams();
  const secret = searchParams.get("secret");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(!!secret);
  const [error, setError] = useState<string | null>(null);
  const [inputSecret, setInputSecret] = useState("");

  const fetchEntries = useCallback(async (s: string) => {
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/asks?secret=${encodeURIComponent(s)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `请求失败 ${res.status}`);
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (secret) fetchEntries(secret);
  }, [secret, fetchEntries]);

  if (!secret) {
    return (
      <div className="admin-shell">
        <div className="admin-card">
          <h1 className="admin-title">查看提问记录</h1>
          <p className="admin-hint">请输入管理员密钥（与 ADMIN_SECRET 一致）</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const s = inputSecret.trim();
              if (s) window.location.href = `/admin?secret=${encodeURIComponent(s)}`;
            }}
            className="admin-form"
          >
            <input
              type="password"
              value={inputSecret}
              onChange={(e) => setInputSecret(e.target.value)}
              placeholder="ADMIN_SECRET"
              className="admin-input"
              autoComplete="off"
            />
            <button type="submit" className="admin-btn">
              查看
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <div className="admin-card admin-list-card">
        <div className="admin-header-row">
          <h1 className="admin-title">最近提问记录</h1>
          <a href="/" className="admin-back">返回首页</a>
        </div>
        {error && <p className="admin-error">{error}</p>}
        {loading ? (
          <p className="admin-loading">加载中…</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>模式</th>
                  <th>对象</th>
                  <th>场景</th>
                  <th>对方特点</th>
                  <th>提问 / 内容</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="admin-empty">
                      暂无记录（请确认已配置 LOG_REQUESTS_PATH 并产生过请求）
                    </td>
                  </tr>
                ) : (
                  entries.map((row, i) => (
                    <tr key={i}>
                      <td className="admin-time">
                        {row.t
                          ? new Date(row.t).toLocaleString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit"
                            })
                          : "-"}
                      </td>
                      <td>
                        {row.mode === "translate"
                          ? "情绪翻译"
                          : row.action === "question"
                            ? "训练出题"
                            : "训练打分"}
                      </td>
                      <td>{row.targetRole ? ROLE_LABEL[row.targetRole] ?? row.targetRole : "-"}</td>
                      <td>{row.scenario ? SCENARIO_LABEL[row.scenario] ?? row.scenario : "-"}</td>
                      <td className="admin-profile">{row.profile || "-"}</td>
                      <td className="admin-content">
                        {(row.text ?? row.trainAnswer ?? "-").toString().slice(0, 120)}
                        {((row.text ?? row.trainAnswer)?.toString().length ?? 0) > 120 ? "…" : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
