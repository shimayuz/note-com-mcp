import { env, authStatus } from "../config/environment.js";
import { API_BASE_URL } from "../config/api-config.js";
import fetch from "node-fetch";

// 動的セッション情報を保持する変数
let activeSessionCookie: string | null = null;
let activeXsrfToken: string | null = null;
let activeUserKey: string | null = null;
let activeGqlAuthToken: string | null = null;

export function getActiveSessionCookie(): string | null {
  return activeSessionCookie;
}

export function getActiveXsrfToken(): string | null {
  return activeXsrfToken;
}

export function getActiveUserKey(): string | null {
  return activeUserKey;
}

export function setActiveUserKey(key: string): void {
  activeUserKey = key;
}

export function setActiveSessionCookie(cookie: string): void {
  activeSessionCookie = cookie;
}

export function setActiveXsrfToken(token: string): void {
  activeXsrfToken = token;
}

export function hasAuth(): boolean {
  // GQLトークンはもう追跡しないので、セッションCookieの有無を主とする
  return activeSessionCookie !== null || authStatus.anyAuth;
}

// noteへのログイン処理を行う関数
export async function loginToNote(): Promise<boolean> {
  if (!env.NOTE_EMAIL || !env.NOTE_PASSWORD) {
    console.error("メールアドレスまたはパスワードが設定されていません。");
    return false;
  }

  const loginPath = "/v1/sessions/sign_in";
  let responseData: any = null; // responseDataを関数スコープで宣言
  const loginUrl = `${API_BASE_URL}${loginPath}`;

  try {
    if (env.DEBUG) {
      console.error(`Attempting login to ${loginUrl}`);
    }

    const response = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
        Accept: "application/json",
      },
      body: JSON.stringify({ login: env.NOTE_EMAIL, password: env.NOTE_PASSWORD }),
    });

    const responseText = await response.text();
    if (env.DEBUG) {
      console.error(`Login response: ${response.status} ${response.statusText}`);
      console.error(
        `Login response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`
      );
      console.error(`Login response body: ${responseText}`);
    }

    if (!response.ok) {
      console.error(`Login failed: ${response.status} ${response.statusText} - ${responseText}`);
      return false;
    }

    // レスポンスボディからトークン情報取得を試みる
    try {
      responseData = JSON.parse(responseText); // 関数スコープのresponseDataに代入
      if (responseData?.data?.key) {
        setActiveUserKey(responseData.data.key);
        if (env.DEBUG) console.error("User key set:", responseData.data.key);
      }
      if (responseData && responseData.data && responseData.data.token) {
        activeSessionCookie = `_note_session_v5=${responseData.data.token}`;
        if (env.DEBUG)
          console.error("Session token found in response body:", responseData.data.token);
        console.error("Login successful. Session token obtained from response body.");
      }
    } catch (e) {
      if (env.DEBUG) console.error("Failed to parse response body as JSON:", e);
    }

    // Set-Cookieヘッダーからの取得方法も残す
    const setCookieHeader = response.headers.get("set-cookie");
    if (setCookieHeader) {
      // console.error(`>>> Before final log: activeXsrfToken = ${activeXsrfToken}`);
      console.error("Set-Cookie header:", setCookieHeader);
      const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      cookies.forEach((cookieStr) => {
        if (cookieStr.includes("_note_session_v5=")) {
          // セッションCookieを保存
          activeSessionCookie = cookieStr.split(";")[0];
          console.error("Session cookie set:", activeSessionCookie);
        } else if (cookieStr.includes("XSRF-TOKEN=")) {
          // XSRFトークンを保存（Cookieから）
          const tokenValue = cookieStr.split(";")[0].split("=")[1];
          activeXsrfToken = decodeURIComponent(tokenValue);
          console.error("XSRF token set from cookie:", activeXsrfToken);
        }
      });
    }

    const responseXsrfToken = response.headers.get("x-xsrf-token");
    if (responseXsrfToken) {
      activeXsrfToken = decodeURIComponent(responseXsrfToken);
      if (env.DEBUG) console.error("XSRF Token from header:", activeXsrfToken);
    } else if (env.DEBUG && !activeXsrfToken) {
      console.error("XSRF Token not found in initial login headers.");
    }

    if (!activeSessionCookie) {
      console.error("Login succeeded but session cookie was not found.");
      return false;
    }

    // console.error(`>>> Before 'Login successful' log: activeSessionCookie = ${activeSessionCookie}`);
    console.error("Login successful. Session cookie obtained.");

    // セッションクッキーが取得できたら、current_userリクエストでXSRFトークンを取得する
    // console.error(`>>> Checking condition for current_user API call: activeSessionCookie=${!!activeSessionCookie}, activeXsrfToken=${!!activeXsrfToken}`);
    if (activeSessionCookie && !activeXsrfToken) {
      console.error("Trying to obtain XSRF token from current_user API...");
      try {
        const currentUserResponse = await fetch(`${API_BASE_URL}/v2/current_user`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
            Cookie: activeSessionCookie,
          },
        });

        // XSRFトークンをヘッダーから取得
        const xsrfToken = currentUserResponse.headers.get("x-xsrf-token");
        if (xsrfToken) {
          activeXsrfToken = decodeURIComponent(xsrfToken);
          console.error("XSRF token successfully obtained from current_user API.");
          if (env.DEBUG) console.error("XSRF Token:", activeXsrfToken);
        } else {
          // Set-Cookieヘッダーからも確認
          const currentUserSetCookieHeader = currentUserResponse.headers.get("set-cookie");
          // console.log(`>>> current_user API response Set-Cookie header: ${currentUserSetCookieHeader}`);
          if (currentUserSetCookieHeader) {
            const cookies = Array.isArray(currentUserSetCookieHeader)
              ? currentUserSetCookieHeader
              : [currentUserSetCookieHeader];
            cookies.forEach((cookieStr) => {
              if (cookieStr.includes("XSRF-TOKEN=")) {
                activeXsrfToken = decodeURIComponent(cookieStr.split(";")[0].split("=")[1]);
                console.error("XSRF token found in current_user response cookies.");
                if (env.DEBUG) console.error("XSRF Token from cookie:", activeXsrfToken);
              }
            });
          }

          // activeXsrfToken がここでセットされていれば、後続の処理に進む
        }
      } catch (error) {
        console.error("Error fetching current_user for XSRF token:", error);
      }
    }
    // console.log(`>>> After current_user API call: activeXsrfToken = ${activeXsrfToken}`);

    if (env.DEBUG) {
      // console.error(`>>> Login state check: session=${!!activeSessionCookie}, xsrf=${!!activeXsrfToken} (value: ${activeXsrfToken})`);
    }

    // Login success is primarily based on session cookie and XSRF token.
    // preview_access_token will be fetched by a dedicated function when needed.
    if (activeSessionCookie && activeXsrfToken) {
      console.error("Session cookie and XSRF token successfully obtained/confirmed.");
    } else if (activeSessionCookie) {
      console.warn(
        "Session cookie obtained, but XSRF token is missing. Further operations might fail."
      );
    } else {
      console.error("Failed to obtain session cookie. Login is considered unsuccessful.");
      return false; // Explicitly return false if session cookie is not obtained
    }

    return activeSessionCookie !== null;
  } catch (error) {
    console.error("Error during login:", error);
    return false;
  }
}

// 認証ヘッダーを構築する関数 (CookieとXSRFトークン専用)
export function buildAuthHeaders(): { [key: string]: string } {
  const headers: { [key: string]: string } = {};
  const cookies = [];

  // 動的に取得したCookieがある場合は優先
  if (activeSessionCookie) {
    cookies.push(activeSessionCookie);
    if (env.DEBUG) console.error("Using dynamically obtained session cookie for Cookie header");
    if (cookies.length > 0) {
      headers["Cookie"] = cookies.join("; ");
    }
  } else if (process.env.NOTE_ALL_COOKIES) {
    // すべてのCookieを使用（参照記事の方式）
    // XSRF-TOKENはヘッダーで送るのでCookieからは除外
    const cookiesWithoutXsrf = process.env.NOTE_ALL_COOKIES.split("; ")
      .filter((c) => !c.startsWith("XSRF-TOKEN="))
      .join("; ");
    headers["Cookie"] = cookiesWithoutXsrf;
    if (env.DEBUG)
      console.error("Using all cookies from .env file for Cookie header (XSRF-TOKEN excluded)");
  } else if (env.NOTE_SESSION_V5) {
    // .envファイルのセッションCookieを使用
    cookies.push(`_note_session_v5=${env.NOTE_SESSION_V5}`);
    if (env.DEBUG) console.error("Using session cookie from .env file for Cookie header");
    if (cookies.length > 0) {
      headers["Cookie"] = cookies.join("; ");
    }
  }

  // XSRFトークンの設定 (ヘッダー用)
  // 動的に取得したトークンを優先（ログインで取得した新しいトークンを使用）
  if (activeXsrfToken) {
    headers["X-XSRF-TOKEN"] = activeXsrfToken;
    if (env.DEBUG) console.error("Using dynamically obtained XSRF token for X-XSRF-TOKEN header");
  } else if (env.NOTE_XSRF_TOKEN) {
    headers["X-XSRF-TOKEN"] = env.NOTE_XSRF_TOKEN;
    if (env.DEBUG) console.error("Using XSRF token from .env file for X-XSRF-TOKEN header");
  }

  // User-Agentは常に設定
  headers["User-Agent"] =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36";

  return headers;
}

// preview_access_tokenを取得する関数
export async function getPreviewAccessToken(noteId: string): Promise<string | null> {
  if (!activeSessionCookie || !activeXsrfToken) {
    console.error("Cannot get preview_access_token: Session cookie or XSRF token is missing.");
    return null;
  }
  if (!noteId) {
    console.error("Cannot get preview_access_token: noteId is missing.");
    return null;
  }

  const url = `${API_BASE_URL}/api/v2/notes/${noteId}/access_tokens`;
  const headers = buildAuthHeaders(); // これには Cookie と X-XSRF-TOKEN が含まれる
  headers["Content-Type"] = "application/json"; // POSTリクエストのため

  if (env.DEBUG) {
    console.error(`Attempting to get preview_access_token for noteId ${noteId} from ${url}`);
    console.error(`Request headers for preview_access_token: ${JSON.stringify(headers)}`);
  }

  try {
    const response = await fetch(url, {
      method: "POST", // ユーザーの分析に基づきPOSTメソッドを使用
      headers: headers,
      body: JSON.stringify({}), // 空のJSONボディと仮定
    });

    const responseText = await response.text();
    if (env.DEBUG) {
      console.error(`PreviewAccessToken API response: ${response.status} ${response.statusText}`);
      console.error(
        `PreviewAccessToken API response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`
      );
      console.error(`PreviewAccessToken API response body: ${responseText}`);
    }

    if (!response.ok) {
      console.error(
        `Failed to get preview_access_token: ${response.status} ${response.statusText} - ${responseText}`
      );
      return null;
    }

    const responseJson = JSON.parse(responseText);
    const token = responseJson?.data?.preview_access_token;

    if (token) {
      console.error("Preview access token successfully obtained.");
      if (env.DEBUG) console.error("Preview Access Token:", token);
      return token;
    } else {
      console.error("Preview access token not found in response.");
      return null;
    }
  } catch (error) {
    console.error("Error obtaining preview_access_token:", error);
    return null;
  }
}
