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
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

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

    res.json({ options });
  } catch (error) {
    logger.error("Passkey registration options error:", error);
    res.status(500).json({ error: "Failed to generate registration options" });
  }
});

// ── POST /register/verify ────────────────────────────────────────────────────
// Verify registration response and save the credential
passkeyRouter.post("/register/verify", async (req: any, res: any) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const challenge = req.session.pendingWebAuthnChallenge;
    if (!challenge) {
      return res
        .status(400)
        .json({ error: "No pending registration challenge" });
    }

    const { credential, deviceName } = req.body as {
      credential: RegistrationResponseJSON;
      deviceName?: string;
    };
    if (!credential) {
      return res.status(400).json({ error: "Missing credential data" });
    }

    const expectedOrigin = getOrigin(req);

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin,
      expectedRPID: getRpID(req),
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res
        .status(400)
        .json({ error: "Registration verification failed" });
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

    res.json({
      success: true,
      message: "Passkey registered successfully",
    });
  } catch (error) {
    logger.error("Passkey registration verify error:", error);
    res.status(500).json({ error: "Registration verification failed" });
  }
});

// ── POST /auth/options ───────────────────────────────────────────────────────
// Generate authentication challenge (used during login 2FA)
passkeyRouter.post("/auth/options", async (req: any, res: any) => {
  try {
    const pendingUserId = req.session?.pendingUserId;
    if (!pendingUserId) {
      return res.status(400).json({ error: "No pending login session" });
    }

    // Get user's passkeys
    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId: pendingUserId },
    });

    if (credentials.length === 0) {
      return res.status(400).json({ error: "No passkeys registered" });
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

    res.json({ options });
  } catch (error) {
    logger.error("Passkey auth options error:", error);
    res.status(500).json({ error: "Failed to generate auth options" });
  }
});

// ── POST /auth/verify ────────────────────────────────────────────────────────
// Verify authentication assertion (completes 2FA login)
passkeyRouter.post("/auth/verify", async (req: any, res: any) => {
  try {
    const pendingUserId = req.session?.pendingUserId;
    if (!pendingUserId) {
      return res.status(400).json({ error: "No pending login session" });
    }

    const challenge = req.session.pendingWebAuthnChallenge;
    if (!challenge) {
      return res.status(400).json({ error: "No pending auth challenge" });
    }

    const { credential } = req.body as {
      credential: AuthenticationResponseJSON;
    };
    if (!credential) {
      return res.status(400).json({ error: "Missing credential data" });
    }

    // Find the stored credential
    const storedCredential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: credential.id },
    });
    if (!storedCredential) {
      return res.status(400).json({ error: "Credential not found" });
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
      return res.status(400).json({ error: "Authentication failed" });
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
      return res.status(404).json({ error: "User not found" });
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

    res.json({ success: true, redirect: "/" });
  } catch (error) {
    logger.error("Passkey auth verify error:", error);
    res.status(500).json({ error: "Authentication verification failed" });
  }
});

// ── GET / ────────────────────────────────────────────────────────────────────
// List user's registered passkeys
passkeyRouter.get("/", async (req: any, res: any) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId },
      select: {
        id: true,
        deviceName: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ passkeys: credentials });
  } catch (error) {
    logger.error("Passkey list error:", error);
    res.status(500).json({ error: "Failed to list passkeys" });
  }
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────
// Remove a passkey
passkeyRouter.delete("/:id", async (req: any, res: any) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const credential = await prisma.webAuthnCredential.findFirst({
      where: { id, userId },
    });
    if (!credential) {
      return res.status(404).json({ error: "Passkey not found" });
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

    res.json({ success: true });
  } catch (error) {
    logger.error("Passkey delete error:", error);
    res.status(500).json({ error: "Failed to delete passkey" });
  }
});

export default passkeyRouter;
