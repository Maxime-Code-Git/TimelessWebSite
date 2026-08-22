import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import { verifyAdminPassword, constantTimeEqual, getAdminConfig, requireAdminSession, computeCredentialVersion } from "../lib/auth.server";
import { checkRateLimit, resetRateLimit } from "../lib/rate-limit.server";
import { commitSession, destroySession } from "../lib/session.server";
import styles from "./admin.module.css";
import * as crypto from "node:crypto";
import { getClientIp, validateOrigin } from "../lib/security.server";

const MAX_BODY_SIZE = 100 * 1024; // 100 KB

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    getAdminConfig();
  } catch (e: unknown) {
    if (e instanceof Response) throw e;
    throw new Response("Configuration Error", { status: 503 });
  }

  const { isValid, session } = await requireAdminSession(request);
  const headers = new Headers();

  // If the user submitted a cookie but it's invalid, destroy it to clean up the browser state.
  // We only redirect if they actually have a cookie that we want to clear.
  const cookieHeader = request.headers.get("Cookie");
  if (!isValid && cookieHeader && cookieHeader.includes("__admin_session")) {
    return redirect("/admin", {
      headers: {
        "Set-Cookie": await destroySession(session),
      },
    });
  }

  // Generate CSRF token for forms
  let csrfToken = session.get("csrfToken");
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  return Response.json(
    { isAuthenticated: isValid, csrfToken },
    { headers },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  // 1. Check config
  try {
    getAdminConfig();
  } catch (e: unknown) {
    if (e instanceof Response) throw e;
    throw new Response("Configuration Error", { status: 503 });
  }

  // 2. Validate Method
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 3. Strict Origin Validation
  if (!validateOrigin(request)) {
    return new Response("Forbidden: Invalid Origin", { status: 403 });
  }

  // 4. Content Type & Size limits BEFORE unbounded read
  const rawContentType = request.headers.get("content-type") || "";
  const mimeType = rawContentType.split(";")[0]?.trim().toLowerCase();

  if (mimeType !== "application/x-www-form-urlencoded" && mimeType !== "multipart/form-data") {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  const contentLengthStr = request.headers.get("content-length");
  if (contentLengthStr) {
    if (!/^\d+$/.test(contentLengthStr)) {
      return new Response("Invalid Content-Length", { status: 400 });
    }
    const contentLength = Number(contentLengthStr);
    if (!Number.isSafeInteger(contentLength) || contentLength > MAX_BODY_SIZE) {
      return new Response("Payload Too Large", { status: 413 });
    }
  }

  if (!request.body) {
    return new Response("Bad Request", { status: 400 });
  }

  let totalBytes = 0;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_SIZE) {
          await reader.cancel("Payload too large");
          return new Response("Payload Too Large", { status: 413 });
        }
        chunks.push(value);
      }
    }
  } catch {
    return new Response("Error reading request", { status: 400 });
  }

  const completeBody = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    completeBody.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const safeRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: completeBody,
  });

  // 5. Parse Body securely
  let formData: FormData;
  try {
    formData = await safeRequest.formData();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const intent = formData.get("intent");
  const formCsrf = String(formData.get("csrfToken") ?? "");

  // 6. Session parsing and Auth validation
  const { isValid, session } = await requireAdminSession(request);
  const sessionCsrf = session.get("csrfToken") ?? "";

  // 7. IP and Rate Limit
  const ip = getClientIp(request);
  if (!ip) {
    return new Response("Forbidden: Invalid IP", { status: 403 });
  }

  try {
    checkRateLimit(ip, "admin");
  } catch {
    return Response.json(
      { error: "Trop de tentatives. Veuillez réessayer dans 15 minutes." },
      { status: 429 }
    );
  }

  // 8. CSRF Validation
  if (!formCsrf || !sessionCsrf || !constantTimeEqual(formCsrf, sessionCsrf)) {
    return new Response("Invalid CSRF token", { status: 403 });
  }

  // 9. Intent routing
  if (intent === "logout") {
    // Only authenticated users can logout, technically, but we just destroy anyway.
    return redirect("/admin", {
      headers: {
        "Set-Cookie": await destroySession(session),
      },
    });
  }

  if (intent === "login") {
    // Cannot login if already authenticated
    if (isValid) {
      return redirect("/admin");
    }

    const password = formData.get("password");
    if (typeof password !== "string" || !password) {
      return Response.json(
        { error: "Le mot de passe est requis." },
        { status: 400 }
      );
    }

    const isCorrect = await verifyAdminPassword(password);
    if (!isCorrect) {
      return Response.json(
        { error: "Mot de passe incorrect." },
        { status: 401 }
      );
    }

    // Success: clear rate limit and create session
    resetRateLimit(ip, "admin");
    session.set("adminId", crypto.randomUUID());
    session.set("credentialVersion", computeCredentialVersion());

    // Rotate CSRF token after login
    session.set("csrfToken", crypto.randomUUID());

    return redirect("/admin", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  }

  return new Response("Bad Request", { status: 400 });
}

export default function AdminPage() {
  const { isAuthenticated, csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (isAuthenticated) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>Administration Timeless</h1>
            <p className={styles.headerSubtitle}>Vous êtes connecté</p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="logout" />
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.logoutButton}
            >
              {isSubmitting ? "Déconnexion..." : "Se déconnecter"}
            </button>
          </Form>
        </header>

        <main className={styles.mainContent}>
          <div className={styles.dashboardCard}>
            <h2 className={styles.dashboardTitle}>Bienvenue dans l'espace administration</h2>
            <p className={styles.dashboardText}>
              Le tableau de bord complet sera implémenté lors des prochaines phases.
            </p>
            <div className={styles.grid}>
              <div className={`${styles.card} ${styles.disabledCard}`}>
                <h3>Galeries clients</h3>
                <p>Fonctionnalité disponible prochainement</p>
              </div>
              <div className={`${styles.card} ${styles.disabledCard}`}>
                <h3>Portfolio public</h3>
                <p>Fonctionnalité disponible prochainement</p>
              </div>
              <Link to="/admin/pricing" className={styles.card}>
                <h3>Formules et tarifs</h3>
                <p>Gérer les prix et offres</p>
              </Link>
              <Link to="/admin/settings" className={styles.card}>
                <h3>Textes et informations</h3>
                <p>Gérer les coordonnées et informations légales</p>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <main className={styles.mainContent}>
        <div className={styles.loginCard}>
          <h1 className={styles.loginTitle}>Administration</h1>

          <Form method="post" className={styles.form}>
            <input type="hidden" name="intent" value="login" />
            <input type="hidden" name="csrfToken" value={csrfToken} />

            <div>
              <label htmlFor="password" className={styles.label}>
                Mot de passe
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className={styles.input}
              />
            </div>

            {actionData?.error && (
              <p className={styles.error} role="alert">
                {actionData.error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.submitButton}
            >
              {isSubmitting ? "Connexion..." : "Se connecter"}
            </button>
          </Form>
        </div>
      </main>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 503) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorBox}>
          <h1 className={styles.errorTitle}>Administration indisponible</h1>
          <p className={styles.errorText}>
            {error.data || "La configuration administrateur est incomplète."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.errorContainer}>
      <div className={styles.errorBox}>
        <h1 className={styles.errorTitle}>Une erreur est survenue</h1>
        <p className={styles.errorText}>
          Impossible d'afficher la page d'administration.
        </p>
      </div>
    </div>
  );
}
