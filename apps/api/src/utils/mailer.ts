import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    });
  }
  return _transporter;
}

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
  .wrapper { max-width: 520px; margin: 40px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .header { background: #4f46e5; padding: 24px 32px; }
  .header h1 { color: #ffffff; font-size: 18px; margin: 0; font-weight: 600; }
  .body { padding: 32px; color: #1e293b; line-height: 1.6; font-size: 14px; }
  .body p { margin: 0 0 16px; }
  .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 10px 22px; border-radius: 6px; font-weight: 500; font-size: 14px; margin: 8px 0 16px; }
  .footer { padding: 16px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  .code { font-family: 'Courier New', monospace; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 16px; font-size: 22px; letter-spacing: 4px; display: inline-block; margin: 8px 0 16px; color: #1e293b; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header"><h1>Vexlyx Panel</h1></div>
  <div class="body">${body}</div>
  <div class="footer">This email was sent by the Vexlyx panel. If you did not expect this, please contact your administrator.</div>
</div>
</body>
</html>`;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(opts: SendMailOptions): Promise<void> {
  await getTransporter().sendMail({
    from: env.MAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.subject,
  });
}

export function passwordResetEmail(opts: {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): { subject: string; html: string } {
  const subject = "Reset your Vexlyx password";
  const html = baseTemplate(subject, `
    <p>Hi ${opts.name},</p>
    <p>You requested a password reset for your Vexlyx account. Click the button below to set a new password:</p>
    <a href="${opts.resetUrl}" class="btn">Reset password</a>
    <p>This link will expire in <strong>${opts.expiresInMinutes} minutes</strong>.</p>
    <p>If you didn't request a password reset, you can safely ignore this email.</p>
  `);
  return { subject, html };
}

export function securityAlertEmail(opts: {
  name: string;
  event: string;
  detail: string;
  panelUrl?: string;
}): { subject: string; html: string } {
  const subject = `Security alert: ${opts.event}`;
  const html = baseTemplate(subject, `
    <p>Hi ${opts.name},</p>
    <p>A security-relevant change was made to your account:</p>
    <p><strong>${opts.detail}</strong></p>
    ${opts.panelUrl ? `<p>If this wasn't you, <a href="${opts.panelUrl}/settings">review your account settings</a> immediately.</p>` : ""}
    <p>If you made this change, no action is needed.</p>
  `);
  return { subject, html };
}

export function roleChangeEmail(opts: {
  name: string;
  oldRole: string;
  newRole: string;
  changedBy: string;
}): { subject: string; html: string } {
  const subject = "Your Vexlyx account role has changed";
  const html = baseTemplate(subject, `
    <p>Hi ${opts.name},</p>
    <p>Your account role was changed by an administrator (<strong>${opts.changedBy}</strong>):</p>
    <p>${opts.oldRole} &rarr; <strong>${opts.newRole}</strong></p>
    <p>If you have questions about this change, please contact your administrator.</p>
  `);
  return { subject, html };
}

export function quotaWarningEmail(opts: {
  name: string;
  resource: string;
  used: number;
  max: number;
}): { subject: string; html: string } {
  const percent = Math.round((opts.used / opts.max) * 100);
  const subject = `Quota warning: ${opts.resource} at ${percent}%`;
  const html = baseTemplate(subject, `
    <p>Hi ${opts.name},</p>
    <p>Your usage of <strong>${opts.resource}</strong> is approaching its limit:</p>
    <p><strong>${opts.used} / ${opts.max}</strong> (${percent}%)</p>
    <p>Consider upgrading your plan or removing unused resources to avoid disruption.</p>
  `);
  return { subject, html };
}

export function backupFailureEmail(opts: {
  name: string;
  triggeredAt: string;
  errorMessage?: string;
}): { subject: string; html: string } {
  const subject = "Backup failed — action required";
  const html = baseTemplate(subject, `
    <p>Hi ${opts.name},</p>
    <p>A scheduled backup that started at <strong>${opts.triggeredAt}</strong> failed to complete.</p>
    ${opts.errorMessage ? `<p>Error: <code>${opts.errorMessage}</code></p>` : ""}
    <p>Please check your backup settings and disk space, then run a manual backup to verify the issue is resolved.</p>
  `);
  return { subject, html };
}
