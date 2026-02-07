import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import logger from '../config/logger.js';

interface CriticalAlertData {
  error: string;
  stack: string;
  endpoint: string;
  user: string;
  clientId: string;
  timestamp: string;
}

export class AlertService {
  private static transporter: nodemailer.Transporter | null = null;

  private static getTransporter() {
    if (!this.transporter && env.SMTP_HOST && env.SMTP_USER) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_SECURE || false,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD,
        },
      });
    }
    return this.transporter;
  }

  static async sendCriticalAlert(data: CriticalAlertData): Promise<void> {
    const transporter = this.getTransporter();

    if (!transporter || !env.ADMIN_EMAIL) {
      logger.warn('Email alerts not configured, skipping alert');
      return;
    }

    const emailHtml = `
      <h2>🚨 Critical Error Alert - POS Backend</h2>
      <p><strong>Timestamp:</strong> ${data.timestamp}</p>
      <p><strong>Endpoint:</strong> ${data.endpoint}</p>
      <p><strong>User ID:</strong> ${data.user}</p>
      <p><strong>Client ID:</strong> ${data.clientId}</p>
      
      <h3>Error Message:</h3>
      <pre style="background: #f4f4f4; padding: 10px; border-radius: 5px;">${data.error}</pre>
      
      <h3>Stack Trace:</h3>
      <pre style="background: #f4f4f4; padding: 10px; border-radius: 5px; font-size: 12px;">${data.stack}</pre>
    `;

    try {
      await transporter.sendMail({
        from: env.SMTP_USER,
        to: env.ADMIN_EMAIL,
        subject: `🚨 Critical Error: ${data.error.substring(0, 50)}...`,
        html: emailHtml,
      });

      logger.info(`Critical alert sent to ${env.ADMIN_EMAIL}`);
    } catch (error) {
      logger.error({ error }, 'Failed to send email alert');
    }
  }

  static async sendLicenseAlert(
    clientId: string,
    message: string
  ): Promise<void> {
    const transporter = this.getTransporter();

    if (!transporter || !env.ADMIN_EMAIL) {
      return;
    }

    try {
      await transporter.sendMail({
        from: env.SMTP_USER,
        to: env.ADMIN_EMAIL,
        subject: `⚠️ License Alert: ${clientId}`,
        html: `
          <h2>License System Alert</h2>
          <p><strong>Client ID:</strong> ${clientId}</p>
          <p><strong>Message:</strong> ${message}</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        `,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send license alert');
    }
  }
}
