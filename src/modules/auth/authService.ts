import { getSettings } from "../../handlers/settingsCache";
import bcrypt from "bcryptjs";
import prisma from "../../db";
import type { Request, Response } from "express";
import { Router } from "express";
import type { Module } from "../../handlers/moduleInit";
import logger from "../../handlers/logger";
import rateLimit from "express-rate-limit";
import { getClientIp } from "../../utils/ip";
import {
  loginSchema,
  registerSchema,
  authValidationErrorCode,
} from "./schemas";

// Tight rate limit applied only to auth routes — separate from the global limit.
// 10 attempts per minute per IP before they get a 429.
const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a minute." },
  keyGenerator: (req) => getClientIp(req),
  validate: false,
});

async function getSecuritySettings() {
  try {
    const s = await getSettings();
    return {
      maxAttempts: s?.loginMaxAttempts ?? 5,
      lockoutMinutes: s?.loginLockoutMinutes ?? 15,
    };
  } catch {
    return { maxAttempts: 5, lockoutMinutes: 15 };
  }
}

const authServiceModule: Module = {
  info: {
    name: "Auth System Module",
    description: "Authentication and authorisation for users.",
    version: "2.0.0",
    moduleVersion: "2.0.0",
    author: "AirlinkLab",
    license: "MIT",
  },

  router: () => {
    const router = Router();

    // ── POST /login ─────────────────────────────────────────────────────────
    router.post(
      "/login",
      authRateLimit,
      async (req: Request, res: Response) => {
        const parsed = loginSchema.safeParse(req.body);

        if (!parsed.success) {
          return res.redirect("/login?err=invalid_credentials");
        }

        const { identifier, password, "remember-me": rememberMe } = parsed.data;

        try {
          const { maxAttempts, lockoutMinutes } = await getSecuritySettings();

          const user = await prisma.users.findFirst({
            where: { OR: [{ email: identifier }, { username: identifier }] },
          });

          // Always run bcrypt to prevent timing-based user enumeration.
          const hash = user?.password ?? `$2b$10$${"x".repeat(53)}`;
          const isPasswordValid = await bcrypt.compare(password, hash);

          // Check lockout (only meaningful if the user exists).
          if (user && user.lockedUntil && user.lockedUntil > new Date()) {
            const minutesLeft = Math.ceil(
              (user.lockedUntil.getTime() - Date.now()) / 60000,
            );
            return res.redirect(
              `/login?err=account_locked&wait=${minutesLeft}`,
            );
          }

          if (!user || !isPasswordValid) {
            // Increment failed attempt counter on the matching user account.
            if (user) {
              const newAttempts = (user.loginAttempts ?? 0) + 1;
              const shouldLock = newAttempts >= maxAttempts;
              await prisma.users.update({
                where: { id: user.id },
                data: {
                  loginAttempts: newAttempts,
                  lockedUntil: shouldLock
                    ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
                    : null,
                },
              });
            }
            // Single generic error — never reveal whether the username exists.
            return res.redirect("/login?err=invalid_credentials");
          }

          // Successful login: reset counters.
          await prisma.users.update({
            where: { id: user.id },
            data: { loginAttempts: 0, lockedUntil: null },
          });

          await new Promise<void>((resolve, reject) =>
            req.session.regenerate((err) => (err ? reject(err) : resolve())),
          );

          // Set session duration based on "Remember me" checkbox.
          // Checked: 30 days. Unchecked: 24 hours.
          if (rememberMe) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
          } else {
            req.session.cookie.maxAge = 24 * 60 * 60 * 1000;
          }

          // Two-factor authentication step: hold the login in a pending state
          // until the user verifies their TOTP code or passkey on /2fa.
          if (user.totpEnabled || user.passkeyEnabled) {
            req.session.pendingUserId = user.id;
            res.redirect("/2fa");
            return;
          }

          req.session.user = {
            id: user.id,
            email: user.email,
            isAdmin: user.role === "owner" || user.role === "admin",
            description: user.description ?? "",
            username: user.username ?? "",
            role: user.role,
            onboardingCompleted: user.onboardingCompleted,
            onboardingSkipped: user.onboardingSkipped,
          };

          await prisma.loginHistory.create({
            data: {
              userId: user.id,
              ipAddress: getClientIp(req),
              userAgent: req.headers["user-agent"] || null,
            },
          });

          res.redirect("/");
        } catch (error) {
          logger.error("Login error:", error);
          res.redirect("/login?err=invalid_credentials");
        }
      },
    );

    // ── POST /register ───────────────────────────────────────────────────────
    router.post(
      "/register",
      authRateLimit,
      async (req: Request, res: Response) => {
        const parsed = registerSchema.safeParse(req.body);

        if (!parsed.success) {
          const code = authValidationErrorCode(parsed.error.issues);
          if (code === "missing") {
            return res.redirect("/register?err=missing_credentials");
          }
          if (code === "invalid_username") {
            return res.redirect("/register?err=invalid_username");
          }
          return res.redirect("/register?err=invalid_input");
        }

        const { email, username, password } = parsed.data;

        try {
          const settings = await getSettings();
          if (!settings?.allowRegistration) {
            // First user always allowed through to bootstrap.
            const userCount = await prisma.users.count();
            if (userCount > 0) {
              return res.redirect("/login?err=registration_disabled");
            }
          }

          // Atomic registration: wrap the check-and-create in a serializable
          // transaction to prevent two concurrent first registrations from
          // both receiving owner privileges.
          const user = await prisma.$transaction(
            async (tx) => {
              const userCount = await tx.users.count();
              const isFirstUser = userCount === 0;

              // Check for existing user (email or username conflict).
              const existing = await tx.users.findFirst({
                where: { OR: [{ email }, { username }] },
              });
              if (existing) {
                throw new Error("USER_EXISTS");
              }

              return tx.users.create({
                data: {
                  email,
                  username,
                  password: await bcrypt.hash(password, 12),
                  description: "No About Me",
                  role: isFirstUser ? "owner" : "user",
                  isAdmin: isFirstUser,
                },
              });
            },
            { isolationLevel: "Serializable" },
          );

          if (user.role === "owner") {
            // Auto-login the first user.
            await new Promise<void>((resolve, reject) =>
              req.session.regenerate((err) => (err ? reject(err) : resolve())),
            );
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
            req.session.user = {
              id: user.id,
              email: user.email,
              isAdmin: user.role === "owner" || user.role === "admin",
              description: user.description ?? "",
              username: user.username ?? "",
              role: user.role,
              onboardingCompleted: user.onboardingCompleted,
              onboardingSkipped: user.onboardingSkipped,
            };
            return res.redirect("/");
          }

          res.redirect("/login");
        } catch (error) {
          if (error instanceof Error && error.message === "USER_EXISTS") {
            return res.redirect("/register?err=user_already_exists");
          }
          logger.error("Register error:", error);
          res.redirect("/register?err=missing_credentials");
        }
      },
    );

    // ── GET /logout ──────────────────────────────────────────────────────────
    // Canonical logout route. The browser initiates logout via a plain GET link
    // (<a href="/logout"> in template.ejs / bottomNav.ejs), so only GET is kept;
    // the duplicate POST handler previously lived in auth.ts and is removed.
    router.get("/logout", (req: Request, res: Response) => {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            logger.error("Session destruction error", err);
          }
          res.clearCookie("connect.sid");
          res.redirect("/login");
        });
      } else {
        res.clearCookie("connect.sid");
        res.redirect("/login");
      }
    });

    return router;
  },
};

export default authServiceModule;
