import type { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { generateSecret, generateURI, verifySync } from "otplib";
import * as QRCode from "qrcode";
import crypto from "node:crypto";
import { encrypt, decrypt } from "../../utils/encryption.js";
import { sendMail, passwordResetEmail, securityAlertEmail } from "../../utils/mailer.js";
import { env } from "../../config/env.js";
import type { RegisterInput, LoginInput, ChangePasswordInput } from "./schema.js";

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  resellerId: true,
  maxProjects: true,
  maxDomains: true,
  maxDatabases: true,
  maxMailboxes: true,
  maxSubAccounts: true,
  permissions: true,
  twoFactorEnabled: true,
  createdAt: true,
} as const;

const TOTP_ISSUER = "Vexlyx";

export class AuthService {
  constructor(private prisma: PrismaClient) {}

  async register(data: RegisterInput) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new AuthError("Email already registered", "EMAIL_EXISTS", 409);
    }

    const hashedPassword = await argon2.hash(data.password, {
      type: argon2.argon2id,
    });

    // Auto-promote to ADMIN if this is the first user in the system
    const userCount = await this.prisma.user.count();
    const role = userCount === 0 ? "ADMIN" : "USER";

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        role,
      },
      select: PUBLIC_USER_SELECT,
    });

    return user;
  }

  async login(data: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS", 401);
    }

    const validPassword = await argon2.verify(user.password, data.password);

    if (!validPassword) {
      throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS", 401);
    }

    const { password: _password, totpSecret: _totpSecret, ...publicUser } = user;
    return publicUser;
  }

  // F5.11 — self-service password change.
  async changePassword(userId: string, data: ChangePasswordInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new AuthError("User not found", "USER_NOT_FOUND", 404);
    }

    const validPassword = await argon2.verify(user.password, data.currentPassword);
    if (!validPassword) {
      throw new AuthError("Current password is incorrect", "INVALID_CREDENTIALS", 401);
    }

    const hashedPassword = await argon2.hash(data.newPassword, {
      type: argon2.argon2id,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });

    if (!user) {
      throw new AuthError("User not found", "USER_NOT_FOUND", 404);
    }

    return user;
  }

  // --- Password reset (F5.23) ---

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always return 204-style success to prevent user enumeration.
    if (!user) return;

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiresAt: expiresAt },
    });

    const panelUrl = env.PANEL_DOMAIN
      ? `https://${env.PANEL_DOMAIN}`
      : "http://localhost:3000";
    const resetUrl = `${panelUrl}/reset-password?token=${token}`;

    const { subject, html } = passwordResetEmail({
      name: user.name,
      resetUrl,
      expiresInMinutes: 30,
    });

    // Fire-and-forget — do not leak email/transport errors to the caller
    sendMail({ to: user.email, subject, html }).catch(() => undefined);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new AuthError("Invalid or expired reset token", "INVALID_RESET_TOKEN", 400);
    }

    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    });
  }

  // --- 2FA / TOTP methods (F5.17) ---

  async totpSetup(userId: string): Promise<{ secret: string; qrCodeDataUrl: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AuthError("User not found", "USER_NOT_FOUND", 404);

    if (user.twoFactorEnabled) {
      throw new AuthError("2FA is already enabled", "TOTP_ALREADY_ENABLED", 409);
    }

    const secret = generateSecret({ length: 20 });
    const otpauthUrl = generateURI({
      issuer: TOTP_ISSUER,
      label: user.email,
      secret,
    });

    // Store the secret encrypted, but not yet "enabled" — it becomes active
    // only after the user verifies the first token (totpEnable).
    const encryptedSecret = encrypt(secret);
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptedSecret, twoFactorEnabled: false },
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, qrCodeDataUrl, otpauthUrl };
  }

  async totpEnable(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AuthError("User not found", "USER_NOT_FOUND", 404);

    if (user.twoFactorEnabled) {
      throw new AuthError("2FA is already enabled", "TOTP_ALREADY_ENABLED", 409);
    }

    if (!user.totpSecret) {
      throw new AuthError("2FA setup not initiated — call /totp/setup first", "TOTP_NOT_SETUP", 400);
    }

    const secret = decrypt(user.totpSecret);
    const result = verifySync({ token, secret });

    if (!result.valid) {
      throw new AuthError("Invalid verification code", "TOTP_INVALID", 401);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    const panelUrl = env.PANEL_DOMAIN ? `https://${env.PANEL_DOMAIN}` : undefined;
    const { subject, html } = securityAlertEmail({
      name: user.name,
      event: "Two-factor authentication enabled",
      detail: "Two-factor authentication (TOTP) was enabled on your account.",
      panelUrl,
    });
    sendMail({ to: user.email, subject, html }).catch(() => undefined);
  }

  async totpDisable(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AuthError("User not found", "USER_NOT_FOUND", 404);

    if (!user.twoFactorEnabled) {
      throw new AuthError("2FA is not enabled", "TOTP_NOT_ENABLED", 400);
    }

    const validPassword = await argon2.verify(user.password, password);
    if (!validPassword) {
      throw new AuthError("Incorrect password", "INVALID_CREDENTIALS", 401);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, totpSecret: null },
    });

    const panelUrl = env.PANEL_DOMAIN ? `https://${env.PANEL_DOMAIN}` : undefined;
    const { subject, html } = securityAlertEmail({
      name: user.name,
      event: "Two-factor authentication disabled",
      detail: "Two-factor authentication (TOTP) was disabled on your account.",
      panelUrl,
    });
    sendMail({ to: user.email, subject, html }).catch(() => undefined);
  }

  async totpVerifyLogin(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AuthError("User not found", "USER_NOT_FOUND", 404);

    if (!user.twoFactorEnabled || !user.totpSecret) {
      throw new AuthError("2FA is not enabled for this account", "TOTP_NOT_ENABLED", 400);
    }

    const secret = decrypt(user.totpSecret);
    const result = verifySync({ token, secret });

    if (!result.valid) {
      throw new AuthError("Invalid or expired authentication code", "TOTP_INVALID", 401);
    }
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
