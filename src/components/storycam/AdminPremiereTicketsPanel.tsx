"use client";

import { useState } from "react";

type AdminTicketResponse = {
  issuedCount?: number;
  ok?: true;
  premiereTickets?: {
    activeCount: number;
    availableCount: number;
  };
  user?: {
    email: string;
    id: string;
  };
};

type AdminPremiereTicketsPanelProps = {
  adminEmail: string;
};

const sourceOptions = [
  { label: "Beta 手动发放", value: "manual_beta" },
  { label: "客服补偿", value: "support_compensation" },
  { label: "内部测试", value: "internal_testing" },
  { label: "种子用户", value: "creator_seed" }
] as const;

type ManualPremiereTicketSource = (typeof sourceOptions)[number]["value"];

export function AdminPremiereTicketsPanel({ adminEmail }: AdminPremiereTicketsPanelProps) {
  const [email, setEmail] = useState("");
  const [count, setCount] = useState("1");
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [source, setSource] = useState<ManualPremiereTicketSource>("manual_beta");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<AdminTicketResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function lookupUser(): Promise<void> {
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/premiere-tickets?email=${encodeURIComponent(email.trim())}`, {
        cache: "no-store"
      });
      const body = await response.json();

      if (!response.ok) {
        setResult(null);
        setMessage(adminErrorMessage(body.error));
        return;
      }

      setResult(body);
      setMessage("已读取用户首映券余额。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function issueTickets(): Promise<void> {
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/premiere-tickets", {
        body: JSON.stringify({
          count: Number(count),
          email: email.trim(),
          expiresInDays: Number(expiresInDays),
          note,
          source
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      const body = await response.json();

      if (!response.ok) {
        setResult(null);
        setMessage(adminErrorMessage(body.error));
        return;
      }

      setResult(body);
      setMessage(`已发放 ${body.issuedCount ?? 0} 张首映券。`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="storycam-admin-page">
      <section className="storycam-admin-panel" aria-labelledby="admin-premiere-title">
        <div className="storycam-admin-heading">
          <p>StoryCam Admin</p>
          <h1 id="admin-premiere-title">首映券发放</h1>
          <span>{adminEmail}</span>
        </div>

        <div className="storycam-admin-grid">
          <label className="storycam-admin-field">
            <span>用户邮箱</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="user@example.com" />
          </label>
          <label className="storycam-admin-field">
            <span>发放张数</span>
            <input min={1} max={100} type="number" value={count} onChange={(event) => setCount(event.target.value)} />
          </label>
          <label className="storycam-admin-field">
            <span>有效期天数</span>
            <input
              min={1}
              max={365}
              type="number"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
            />
          </label>
          <label className="storycam-admin-field">
            <span>发放原因</span>
            <select value={source} onChange={(event) => setSource(event.target.value as ManualPremiereTicketSource)}>
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="storycam-admin-field storycam-admin-field--wide">
            <span>备注</span>
            <textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>

        <div className="storycam-admin-actions">
          <button disabled={isSubmitting || !email.trim()} onClick={lookupUser} type="button">
            查询余额
          </button>
          <button disabled={isSubmitting || !email.trim()} onClick={issueTickets} type="button">
            发放首映券
          </button>
        </div>

        {message ? <p className="storycam-admin-message">{message}</p> : null}
        {result?.user && result.premiereTickets ? (
          <div className="storycam-admin-result">
            <span>{result.user.email}</span>
            <strong>可用 {result.premiereTickets.availableCount}</strong>
            <strong>制作中 {result.premiereTickets.activeCount}</strong>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function adminErrorMessage(code: string | undefined): string {
  if (code === "user_not_found") {
    return "没有找到这个用户。";
  }

  if (code === "admin_forbidden") {
    return "当前账号没有后台权限。";
  }

  if (code === "invalid_input") {
    return "请检查邮箱、张数和有效期。";
  }

  return "后台操作暂时失败，请稍后再试。";
}
