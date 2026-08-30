/**
 * Passkey (WebAuthn) API — V2
 *
 * Endpoints:
 *   POST /register/options   — Generate registration challenge
 *   POST /register/verify    — Verify registration response, save credential
 *   POST /auth/options        — Generate authentication challenge (login)
 *   POST /auth/verify         — Verify authentication assertion (login)
 *   GET  /                    — List user's passkeys
 *   DELETE /:id               — Remove a passkey
 */

import { Router } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import prisma from "../../../db";
import logger from "../../../handlers/logger";
import { jsonOk, jsonError } from "./helpers";

const rpName = "Airlink";
// RPID should be the panel's domain — falls back to localhost for dev
const getRpID = (req: any) => {
  const host = req.hostname || "localhost";
  // Strip port if present
  return host.split(":")[0];
};
const getOrigin = (req: any) => {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  return `${proto}://${req.headers.host || req.hostname}`;
};

const passkeyRouter = Router();

// ── POST /register/options ───────────────────────────────────────────────────
// Generate registration challenge for a new passkey
passkeyRouter.post("/register/options", async (req: any, res: any) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId)
      return void jsonError(
        res,
        "UNAUTHORIZED",
        "Authentication required",
        401,
      );

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return void jsonError(res, "NOT_FOUND", "User not found", 404);

    // Get existing credentials for exclusion
    const existingCredentials = await prisma.webAuthnCredential.findMany({
      where: { userId },
    });

    const options = await generateRegistrationOptions({
      rpName,
      rpID: getRpID(req),
      userName: user.email,
      userDisplayName: user.username || user.email,
      attestationType: "none",
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    // Store challenge in session for verification
    req.session.pendingWebAuthnChallenge = options.challenge;

    jsonOk(res, { options });
  } catch (error) {
    logger.error("Passkey registration options error:", error);
    jsonError(res, "INTERNAL", "Failed to generate registration options", 500);
  }
});

// ── POST /register/verify ────────────────────────────────────────────────────
// Verify registration response and save the credential
passkeyRouter.post("/register/verify", async (req: any, res: any) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId)
      return void jsonError(
        res,
        "UNAUTHORIZED",
        "Authentication required",
        401,
      );

    const challenge = req.session.pendingWebAuthnChallenge;
    if (!challenge) {
      return void jsonError(
        res,
        "BAD_REQUEST",
        "No pending registration challenge",
        400,
      );
    }

    const { credential, deviceName } = req.body as {
      credential: RegistrationResponseJSON;
      deviceName?: string;
    };
    if (!credential) {
      return void jsonError(res, "BAD_REQUEST", "Missing credential data", 400);
    }

    const expectedOrigin = getOrigin(req);

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin,
      expectedRPID: getRpID(req),
    });

    if (!verification.verified || !verification.registrationInfo) {
      return void jsonError(
        res,
        "BAD_REQUEST",
        "Registration verification failed",
        400,
      );
    }

    const { credential: regCredential } = verification.registrationInfo;

    // Save the credential
    await prisma.webAuthnCredential.create({
      data: {
        credentialId: regCredential.id,
        publicKey: Buffer.from(regCredential.publicKey).toString("base64url"),
        counter: BigInt(regCredential.counter),
        transports: credential.response?.transports
          ? JSON.stringify(credential.response.transports)
          : null,
        deviceName: deviceName || null,
        userId,
      },
    });

    // Enable passkey 2FA for user
    await prisma.users.update({
      where: { id: userId },
      data: { passkeyEnabled: true },
    });

    // Clear challenge
    delete req.session.pendingWebAuthnChallenge;

    jsonOk(res, { message: "Passkey registered successfully" });
  } catch (error) {
    logger.error("Passkey registration verify error:", error);
    jsonError(res, "INTERNAL", "Registration verification failed", 500);
  }
});

// ── POST /auth/options ───────────────────────────────────────────────────────
// Generate authentication challenge (used during login 2FA)
passkeyRouter.post("/auth/options", async (req: any, res: any) => {
  try {
    const pendingUserId = req.session?.pendingUserId;
    if (!pendingUserId) {
      return void jsonError(
        res,
        "BAD_REQUEST",
        "No pending login session",
        400,
      );
    }

    // Get user's passkeys
    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId: pendingUserId },
    });

    if (credentials.length === 0) {
      return void jsonError(res, "BAD_REQUEST", "No passkeys registered", 400);
    }

    const options = await generateAuthenticationOptions({
      rpID: getRpID(req),
      allowCredentials: credentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      })),
      userVerification: "preferred",
    });

    // Store challenge in session
    req.session.pendingWebAuthnChallenge = options.challenge;

    jsonOk(res, { options });
  } catch (error) {
    logger.error("Passkey auth options error:", error);
    jsonError(res, "INTERNAL", "Failed to generate auth options", 500);
  }
});

// ── POST /auth/verify ────────────────────────────────────────────────────────
// Verify authentication assertion (completes 2FA login)
passkeyRouter.post("/auth/verify", async (req: any, res: any) => {
  try {
    const pendingUserId = req.session?.pendingUserId;
    if (!pendingUserId) {
      return void jsonError(
        res,
        "BAD_REQUEST",
        "No pending login session",
        400,
      );
    }

    const challenge = req.session.pendingWebAuthnChallenge;
    if (!challenge) {
      return void jsonError(
        res,
        "BAD_REQUEST",
        "No pending auth challenge",
        400,
      );
    }

    const { credential } = req.body as {
      credential: AuthenticationResponseJSON;
    };
    if (!credential) {
      return void jsonError(res, "BAD_REQUEST", "Missing credential data", 400);
    }

    // Find the stored credential
    const storedCredential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: credential.id },
    });
    if (!storedCredential) {
      return void jsonError(res, "NOT_FOUND", "Credential not found", 404);
    }

    const expectedOrigin = getOrigin(req);

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin,
      expectedRPID: getRpID(req),
      credential: {
        id: storedCredential.credentialId,
        publicKey: Buffer.from(storedCredential.publicKey, "base64url"),
        counter: Number(storedCredential.counter),
        transports: storedCredential.transports
          ? JSON.parse(storedCredential.transports)
          : undefined,
      },
    });

    if (!verification.verified) {
      return void jsonError(res, "UNAUTHORIZED", "Authentication failed", 400);
    }

    // Update counter
    await prisma.webAuthnCredential.update({
      where: { id: storedCredential.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter) },
    });

    // Complete login — same as twoFactor.ts POST /2fa
    const user = await prisma.users.findUnique({
      where: { id: pendingUserId },
    });
    if (!user) {
      return void jsonError(res, "NOT_FOUND", "User not found", 404);
    }

    const { getClientIp } = await import("../../../utils/ip");

    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err: any) => (err ? reject(err) : resolve())),
    );

    req.session.user = {
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
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

    // Clear pending state
    delete req.session.pendingWebAuthnChallenge;

    jsonOk(res, { redirect: "/" });
  } catch (error) {
    logger.error("Passkey auth verify error:", error);
    jsonError(res, "INTERNAL", "Authentication verification failed", 500);
  }
});

// ── GET / ────────────────────────────────────────────────────────────────────
// List user's registered passkeys
passkeyRouter.get("/", async (req: any, res: any) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId)
      return void jsonError(
        res,
        "UNAUTHORIZED",
        "Authentication required",
        401,
      );

    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId },
      select: {
        id: true,
        deviceName: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    jsonOk(res, credentials);
  } catch (error) {
    logger.error("Passkey list error:", error);
    jsonError(res, "INTERNAL", "Failed to list passkeys", 500);
  }
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────
// Remove a passkey
passkeyRouter.delete("/:id", async (req: any, res: any) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId)
      return void jsonError(
        res,
        "UNAUTHORIZED",
        "Authentication required",
        401,
      );

    const { id } = req.params;

    const credential = await prisma.webAuthnCredential.findFirst({
      where: { id, userId },
    });
    if (!credential) {
      return void jsonError(res, "NOT_FOUND", "Passkey not found", 404);
    }

    await prisma.webAuthnCredential.delete({ where: { id } });

    // Check if user has any passkeys left
    const remaining = await prisma.webAuthnCredential.count({
      where: { userId },
    });
    if (remaining === 0) {
      await prisma.users.update({
        where: { id: userId },
        data: { passkeyEnabled: false },
      });
    }

    jsonOk(res, { message: "Passkey deleted" });
  } catch (error) {
    logger.error("Passkey delete error:", error);
    jsonError(res, "INTERNAL", "Failed to delete passkey", 500);
  }
});

export default passkeyRouter;
