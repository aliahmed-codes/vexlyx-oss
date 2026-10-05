import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import crypto from "node:crypto";
import { RegisterSchema, LoginSchema, ChangePasswordSchema, ForgotPasswordSchema, ResetPasswordSchema } from "./schema.js";
import { AuthService, AuthError } from "./service.js";
import { createSession, destroySession } from "../../plugins/auth.js";
import { env } from "../../config/env.js";

const PENDING_TOTP_TTL = 300; // 5 minutes

function pendingTotpKey(id: string) {
  return `pending_totp:${id}`;
}

export async function authRoutes(app: FastifyInstance) {
  const service = new AuthService(app.prisma);

  // Register rate limiting plugin for this scope
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  });

  // POST /api/auth/register
  app.post("/register", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "15 minutes",
      },
    },
    handler: async (request, reply) => {
      if (!env.ALLOW_REGISTRATION) {
        reply.status(403).send({
          error: "Registration is disabled",
          code: "REGISTRATION_DISABLED",
          details: {},
        });
        return;
      }

      try {
        const data = RegisterSchema.parse(request.body);
        const user = await service.register(data);

        await createSession(app, reply, user.id);

        reply.status(201).send({ user });
      } catch (err) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({
            error: err.message,
            code: err.code,
            details: {},
          });
          return;
        }
        throw err;
      }
    },
  });

  // POST /api/auth/login
  // If 2FA is enabled, returns { requiresTotp: true, pendingToken } instead of
  // creating a session. The client must then POST /api/auth/totp/verify-login.
  app.post("/login", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "15 minutes",
      },
    },
    handler: async (request, reply) => {
      try {
        const data = LoginSchema.parse(request.body);
        const user = await service.login(data);

        if (user.twoFactorEnabled) {
          // Store a short-lived pending token in Redis; do NOT create a session yet.
          const pendingToken = crypto.randomBytes(32).toString("hex");
          await app.redis.set(
            pendingTotpKey(pendingToken),
            user.id,
            "EX",
            PENDING_TOTP_TTL,
          );
          return reply.status(200).send({ requiresTotp: true, pendingToken });
        }

        await createSession(app, reply, user.id);

        return { user };
      } catch (err) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({
            error: err.message,
            code: err.code,
            details: {},
          });
          return;
        }
        throw err;
      }
    },
  });

  // POST /api/auth/totp/verify-login — exchange a pending TOTP token for a real session
  app.post("/totp/verify-login", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
      },
    },
    handler: async (request, reply) => {
      try {
        const body = request.body as { pendingToken?: string; totpToken?: string };
        if (!body.pendingToken || !body.totpToken) {
          return reply.status(400).send({
            error: "pendingToken and totpToken are required",
            code: "MISSING_FIELDS",
            details: {},
          });
        }

        const userId = await app.redis.get(pendingTotpKey(body.pendingToken));
        if (!userId) {
          return reply.status(401).send({
            error: "Invalid or expired login attempt — please start over",
            code: "PENDING_TOKEN_EXPIRED",
            details: {},
          });
        }

        await service.totpVerifyLogin(userId, body.totpToken);

        // TOTP verified — delete the pending token and create a real session
        await app.redis.del(pendingTotpKey(body.pendingToken));
        await createSession(app, reply, userId);

        const user = await service.getCurrentUser(userId);
        return { user };
      } catch (err) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({
            error: err.message,
            code: err.code,
            details: {},
          });
          return;
        }
        throw err;
      }
    },
  });

  // POST /api/auth/logout — no rate limit
  app.post("/logout", async (request, reply) => {
    await destroySession(app, request, reply);
    return { message: "Logged out" };
  });

  // GET /api/auth/me — no rate limit
  app.get(
    "/me",
    { preHandler: [app.requireAuth] },
    async (request) => {
      const user = await service.getCurrentUser(request.userId!);
      return { user };
    },
  );

  // POST /api/auth/change-password (F5.11)
  app.post("/change-password", {
    preHandler: [app.requireAuth],
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "15 minutes",
      },
    },
    handler: async (request, reply) => {
      try {
        const data = ChangePasswordSchema.parse(request.body);
        await service.changePassword(request.userId!, data);
        return { message: "Password changed" };
      } catch (err) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({
            error: err.message,
            code: err.code,
            details: {},
          });
          return;
        }
        throw err;
      }
    },
  });

  // GET /api/auth/config — public, lets the dashboard know whether to show
  // the self-registration form/link (F5.8).
  app.get("/config", async () => {
    return { allowRegistration: env.ALLOW_REGISTRATION };
  });

  // POST /api/auth/forgot-password (F5.23)
  // Always returns 200 to prevent user enumeration.
  app.post("/forgot-password", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "15 minutes",
      },
    },
    handler: async (request, reply) => {
      try {
        const { email } = ForgotPasswordSchema.parse(request.body);
        await service.forgotPassword(email);
        return { message: "If an account with that email exists, a reset link has been sent." };
      } catch (err) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({ error: err.message, code: err.code, details: {} });
          return;
        }
        throw err;
      }
    },
  });

  // POST /api/auth/reset-password (F5.23)
  app.post("/reset-password", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
      },
    },
    handler: async (request, reply) => {
      try {
        const { token, password } = ResetPasswordSchema.parse(request.body);
        await service.resetPassword(token, password);
        return { message: "Password reset successfully. You can now sign in." };
      } catch (err) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({ error: err.message, code: err.code, details: {} });
          return;
        }
        throw err;
      }
    },
  });

  // --- 2FA / TOTP routes (F5.17) ---

  // POST /api/auth/totp/setup — generates a new TOTP secret and QR code.
  // Requires auth. Does NOT enable 2FA yet; call /totp/enable after verifying.
  app.post("/totp/setup", {
    preHandler: [app.requireAuth],
    handler: async (request, reply) => {
      try {
        const result = await service.totpSetup(request.userId!);
        return result;
      } catch (err) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({
            error: err.message,
            code: err.code,
            details: {},
          });
          return;
        }
        throw err;
      }
    },
  });

  // POST /api/auth/totp/enable — verify the first TOTP token and enable 2FA.
  app.post("/totp/enable", {
    preHandler: [app.requireAuth],
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "15 minutes",
      },
    },
    handler: async (request, reply) => {
      try {
        const body = request.body as { token?: string };
        if (!body.token) {
          return reply.status(400).send({
            error: "token is required",
            code: "MISSING_FIELDS",
            details: {},
          });
        }
        await service.totpEnable(request.userId!, body.token);
        return { message: "2FA enabled successfully" };
      } catch (err) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({
            error: err.message,
            code: err.code,
            details: {},
          });
          return;
        }
        throw err;
      }
    },
  });

  // POST /api/auth/totp/disable — re-verify password and disable 2FA.
  app.post("/totp/disable", {
    preHandler: [app.requireAuth],
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "15 minutes",
      },
    },
    handler: async (request, reply) => {
      try {
        const body = request.body as { password?: string };
        if (!body.password) {
          return reply.status(400).send({
            error: "password is required",
            code: "MISSING_FIELDS",
            details: {},
          });
        }
        await service.totpDisable(request.userId!, body.password);
        return { message: "2FA disabled" };
      } catch (err) {
        if (err instanceof AuthError) {
          reply.status(err.statusCode).send({
            error: err.message,
            code: err.code,
            details: {},
          });
          return;
        }
        throw err;
      }
    },
  });
}
