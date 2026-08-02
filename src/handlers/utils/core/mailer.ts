import nodemailer from 'nodemailer';
import prisma from '../../../db';
import logger from '../../logger';

export async function getTransporter() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s?.smtpHost) throw new Error('SMTP not configured');
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort ?? 587,
    secure: s.smtpSecure,
    auth: {
      user: s.smtpUser ?? '',
      pass: s.smtpPassword ?? '',
    },
  });
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    const t = await getTransporter();
    await t.sendMail({
      from: s?.smtpFrom ?? 'noreply@airlink',
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
}

function esc(value: string): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function emailShell(input: { title: string; panelName: string; body: string[] }): string {
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">',
    `<h2 style="margin:0 0 12px;font-size:18px">${esc(input.title)}</h2>`,
    ...input.body.map((p) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">${p}</p>`),
    `<p style="margin:0;font-size:12px;color:#6b7280">— ${esc(input.panelName)}</p>`,
    '</div>',
  ].join('\n');
}

export async function sendServerSuspended(input: {
  to: string;
  panelName: string;
  serverName: string;
  panelUrl: string;
}): Promise<boolean> {
  const subject = `[${input.panelName}] Server suspended`;
  return sendMail(input.to, subject, emailShell({
    title: `Server "${input.serverName}" was suspended`,
    panelName: input.panelName,
    body: [
      `The server <strong>${esc(input.serverName)}</strong> has been suspended by an administrator. It will stay offline until the suspension is lifted.`,
      input.panelUrl
        ? `If you believe this is a mistake, contact your administrator: <a href="${esc(input.panelUrl)}">${esc(input.panelUrl)}</a>.`
        : '',
    ].filter(Boolean),
  }));
}

export async function sendSubUserInvite(input: {
  to: string;
  panelName: string;
  serverName: string;
  inviteUrl: string;
}): Promise<boolean> {
  const subject = `[${input.panelName}] You were invited to "${input.serverName}"`;
  return sendMail(input.to, subject, emailShell({
    title: `Invitation to "${input.serverName}"`,
    panelName: input.panelName,
    body: [
      `You have been added as a subuser to the server <strong>${esc(input.serverName)}</strong>.`,
      `Open the server to accept: <a href="${esc(input.inviteUrl)}">${esc(input.inviteUrl)}</a>.`,
    ],
  }));
}