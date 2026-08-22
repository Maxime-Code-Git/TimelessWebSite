import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "react-router";
import { useRouteError, useActionData, useLoaderData, Form, useNavigation } from "react-router";
import { verifyAdminPassword, computeCredentialVersion } from "../lib/auth.server";
import { getSession, commitSession, destroySession } from "../lib/session.server";
import { checkRateLimit, resetRateLimit } from "../lib/rate-limit.server";
import { ENV } from "../lib/env.server";
import crypto from "node:crypto";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

export const meta = () => {
  return [
    { title: "Administration - Timeless" },
    { name: "robots", content: "noindex, nofollow" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (!ENV.ADMIN_PASSWORD_HASH || !ENV.ADMIN_SESSION_SECRET) {
    return Response.json(
      { isAuthenticated: false, configMissing: true, csrfToken: "" },
      { status: 503 },
    );
  }

  const cookie = request.headers.get("Cookie");
  const session = await getSession(cookie);

  if (session.has("adminId")) {
    // Generate a CSRF token even for the authenticated dashboard (logout form)
    let csrfToken = session.get("csrfToken");
    const headers = new Headers();
    if (!csrfToken) {
      csrfToken = crypto.randomUUID();
      session.set("csrfToken", csrfToken);
      headers.set("Set-Cookie", await commitSession(session));
    }
    return Response.json(
      { isAuthenticated: true, csrfToken, configMissing: false },
      { headers },
    );
  }

  // Generate CSRF token for login form
  let csrfToken = session.get("csrfToken");
  const headers = new Headers();
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  return Response.json(
    { isAuthenticated: false, csrfToken, configMissing: false },
    { headers },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  const origin = request.headers.get("Origin");
  if (!origin) {
    return new Response("Forbidden: Missing Origin", { status: 403 });
  }

  // Enforce body size limit
  const clonedReq = request.clone();
  let totalBytes = 0;
  const reader = clonedReq.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > 10 * 1024) {
          await reader.cancel();
          return new Response("Payload Too Large", { status: 413 });
        }
      }
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const formCsrf = String(formData.get("csrfToken") ?? "");

  const cookie = request.headers.get("Cookie");
  const session = await getSession(cookie);
  const sessionCsrf = session.get("csrfToken") ?? "";

  // CSRF check for both login and logout
  if (!formCsrf || !sessionCsrf || !constantTimeEqual(formCsrf, sessionCsrf)) {
    return new Response("Invalid CSRF token", { status: 403 });
  }

  if (intent === "logout") {
    return redirect("/admin", {
      headers: {
        "Set-Cookie": await destroySession(session),
      },
    });
  }

  if (intent === "login") {
    const ip = request.headers.get("X-Forwarded-For") || "127.0.0.1";
    try {
      checkRateLimit(ip, "admin");
    } catch {
      return { error: "Trop de tentatives. Veuillez réessayer plus tard." };
    }

    const password = formData.get("password");

    if (typeof password !== "string" || !password) {
      return { error: "Mot de passe incorrect." };
    }

    const isValid = await verifyAdminPassword(password);

    if (!isValid) {
      return { error: "Mot de passe incorrect." };
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

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Admin Error:", error);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Erreur inattendue</h1>
        <p>Veuillez réessayer ultérieurement.</p>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { isAuthenticated, csrfToken, configMissing } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (configMissing) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f9fafb" }}>
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem", color: "#111827" }}>Administration temporairement indisponible</h1>
          <p style={{ color: "#6b7280" }}>La configuration administrateur est incomplète.</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f9fafb" }}>
        <header style={{ backgroundColor: "white", borderBottom: "1px solid #e5e7eb", padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#111827" }}>Administration Timeless</h1>
            <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Vous êtes connecté</p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="logout" />
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#ef4444",
                color: "white",
                borderRadius: "0.375rem",
                border: "none",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.7 : 1
              }}
            >
              Se déconnecter
            </button>
          </Form>
        </header>

        <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.5rem" }}>
            {[
              "Galeries clients",
              "Portfolio public",
              "Formules et tarifs",
              "Textes et informations du site"
            ].map(title => (
              <div key={title} style={{ backgroundColor: "white", padding: "1.5rem", borderRadius: "0.5rem", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)", border: "1px solid #e5e7eb" }}>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 500, marginBottom: "1rem", color: "#374151" }}>{title}</h2>
                <p style={{ fontSize: "0.875rem", color: "#9ca3af" }}>Fonctionnalité disponible prochainement</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f9fafb" }}>
      <div style={{ backgroundColor: "white", padding: "2.5rem", borderRadius: "0.75rem", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)", width: "100%", maxWidth: "24rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#111827" }}>Administration</h1>
        </div>

        <Form method="post" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <input type="hidden" name="intent" value="login" />
          <input type="hidden" name="csrfToken" value={csrfToken} />

          <div>
            <label htmlFor="password" style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#374151", marginBottom: "0.5rem" }}>
              Mot de passe
            </label>
            <input
              type="password"
              id="password"
              name="password"
              required
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
                fontSize: "1rem",
                boxSizing: "border-box"
              }}
            />
          </div>

          {actionData?.error && (
            <p style={{ color: "#ef4444", fontSize: "0.875rem", margin: 0 }} role="alert">
              {actionData.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "#111827",
              color: "white",
              borderRadius: "0.375rem",
              border: "none",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.7 : 1,
              marginTop: "0.5rem"
            }}
          >
            {isSubmitting ? "Connexion..." : "Se connecter"}
          </button>
        </Form>
      </div>
    </div>
  );
}
