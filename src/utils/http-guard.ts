import { timingSafeEqual } from "crypto";
import type { IncomingMessage } from "http";

/**
 * HTTPトランスポートのアクセス制御。
 *
 * このサーバーはnote.comのログイン済みセッションを持つため、
 * 届いたリクエストをそのまま実行すると、ブラウザで開いたWebページや
 * ネットワーク上の第三者がアカウントを操作できてしまう。
 * ここで Host / Origin / Bearerトークン を検査する。
 */

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export interface HttpGuardConfig {
  /** 設定されていれば、すべての /mcp リクエストに Bearer トークンを要求する */
  readonly token: string | null;
  /** ループバック以外に受け付ける Host ヘッダー（例: note-mcp.example.com） */
  readonly allowedHosts: ReadonlySet<string>;
  /** 受け付ける Origin ヘッダー。既定では Origin 付きのリクエストをすべて拒否する */
  readonly allowedOrigins: ReadonlySet<string>;
}

export type GuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 401 | 403; readonly message: string };

const parseList = (value: string | undefined): ReadonlySet<string> =>
  new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0),
  );

export const loadHttpGuardConfig = (
  env: NodeJS.ProcessEnv = process.env,
): HttpGuardConfig => {
  const token = (env.MCP_HTTP_TOKEN ?? "").trim();
  return {
    token: token.length > 0 ? token : null,
    allowedHosts: parseList(env.MCP_ALLOWED_HOSTS),
    allowedOrigins: parseList(env.MCP_ALLOWED_ORIGINS),
  };
};

/** バインド先がループバックかどうか */
export const isLoopbackBindHost = (host: string): boolean =>
  LOOPBACK_HOSTNAMES.has(host.trim().toLowerCase());

/** Host ヘッダーからポートを除いたホスト名を取り出す */
const hostnameOf = (hostHeader: string): string => {
  const value = hostHeader.trim().toLowerCase();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end === -1 ? value : value.slice(0, end + 1);
  }
  const colon = value.lastIndexOf(":");
  return colon === -1 ? value : value.slice(0, colon);
};

/**
 * ループバック以外で待ち受ける設定なのにトークンが無い場合は、起動を止める理由を返す。
 * 問題がなければ null。
 */
export const findStartupProblem = (
  bindHost: string,
  config: HttpGuardConfig,
): string | null => {
  if (config.token !== null) return null;
  if (!isLoopbackBindHost(bindHost)) {
    return `MCP_HTTP_HOST=${bindHost} で待ち受けるには MCP_HTTP_TOKEN の設定が必要です。`;
  }
  if (config.allowedHosts.size > 0) {
    return "MCP_ALLOWED_HOSTS を使うには MCP_HTTP_TOKEN の設定が必要です。";
  }
  return null;
};

const tokenMatches = (header: string | undefined, token: string): boolean => {
  const prefix = "bearer ";
  if (!header || !header.toLowerCase().startsWith(prefix)) return false;
  const given = Buffer.from(header.slice(prefix.length).trim());
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

/** /mcp へのリクエストを受け付けてよいか判定する */
export const checkHttpRequest = (
  req: Pick<IncomingMessage, "headers">,
  config: HttpGuardConfig,
): GuardResult => {
  // DNSリバインディング対策: 想定した Host 宛てのリクエストだけを受け付ける
  const hostHeader = String(req.headers.host ?? "").toLowerCase();
  const hostname = hostnameOf(hostHeader);
  const hostAllowed =
    LOOPBACK_HOSTNAMES.has(hostname) ||
    config.allowedHosts.has(hostname) ||
    config.allowedHosts.has(hostHeader);
  if (!hostAllowed) {
    return { ok: false, status: 403, message: "Forbidden: unexpected Host header" };
  }

  // ブラウザ由来のリクエスト対策: Origin 付きは許可リストにあるものだけ
  const origin = req.headers.origin;
  if (origin !== undefined && !config.allowedOrigins.has(String(origin).toLowerCase())) {
    return { ok: false, status: 403, message: "Forbidden: unexpected Origin header" };
  }

  if (config.token !== null && !tokenMatches(req.headers.authorization, config.token)) {
    return { ok: false, status: 401, message: "Unauthorized: missing or invalid bearer token" };
  }

  return { ok: true };
};
