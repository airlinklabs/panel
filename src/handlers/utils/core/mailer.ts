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
