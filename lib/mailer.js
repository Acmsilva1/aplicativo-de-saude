/**
 * Envio externo de e-mail (fallback quando o SMTP do Supabase falha).
 * Preferência: SMTP/Gmail (nodemailer) → Resend API.
 * Resend com onboarding@resend.dev não entrega para terceiros.
 */

import nodemailer from 'nodemailer';

function env(name) {
  return String(process.env[name] || '').trim();
}

function hasSmtpConfig() {
  return Boolean(env('SMTP_USER') && env('SMTP_PASS'));
}

function hasResendConfig() {
  return Boolean(env('RESEND_API_KEY'));
}

export function hasExternalMailer() {
  return hasSmtpConfig() || hasResendConfig();
}

function smtpFrom() {
  return env('SMTP_FROM') || env('SMTP_USER') || 'noreply@localhost';
}

function resendFrom() {
  return env('RESEND_FROM') || env('SMTP_FROM') || 'Ritmo Saúde <onboarding@resend.dev>';
}

async function sendViaSmtp({ to, subject, html, text }) {
  const host = env('SMTP_HOST') || 'smtp.gmail.com';
  const port = Number(env('SMTP_PORT') || 587);
  const secure = env('SMTP_SECURE') === 'true' || port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: env('SMTP_USER'),
      pass: env('SMTP_PASS'),
    },
  });
  await transporter.sendMail({
    from: smtpFrom(),
    to,
    subject,
    text,
    html,
  });
  return 'smtp';
}

async function sendViaResend({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFrom(),
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return 'resend';
}

/**
 * @param {{ to: string, subject: string, html: string, text?: string }} opts
 * @returns {Promise<{ ok: true, provider: string } | { ok: false, error: string }>}
 */
export async function sendAppEmail(opts) {
  const to = String(opts?.to || '').trim().toLowerCase();
  const subject = String(opts?.subject || '').trim();
  const html = String(opts?.html || '');
  const text = String(opts?.text || html.replace(/<[^>]+>/g, ' ')).trim();
  if (!to || !subject || !html) {
    return { ok: false, error: 'Destinatário, assunto e corpo são obrigatórios.' };
  }

  const attempts = [];
  if (hasSmtpConfig()) attempts.push(sendViaSmtp);
  if (hasResendConfig()) attempts.push(sendViaResend);
  if (!attempts.length) {
    return { ok: false, error: 'Nenhum provedor de e-mail configurado (SMTP_* ou RESEND_API_KEY).' };
  }

  let lastError = '';
  for (const send of attempts) {
    try {
      const provider = await send({ to, subject, html, text });
      return { ok: true, provider };
    } catch (err) {
      lastError = String(err?.message || err || 'Falha no envio').slice(0, 300);
    }
  }
  return { ok: false, error: lastError || 'Falha no envio externo de e-mail.' };
}

/**
 * Envia o link de convite/recuperação gerado pelo Supabase.
 * @param {{ to: string, link: string, kind?: 'invite' | 'recovery', name?: string }} opts
 */
export async function sendAuthLinkEmail({ to, link, kind = 'invite', name = '' }) {
  const actionLink = String(link || '').trim();
  if (!actionLink) return { ok: false, error: 'Link de autenticação ausente.' };

  const isRecovery = kind === 'recovery';
  const subject = isRecovery
    ? 'Defina sua senha — Ritmo Saúde'
    : 'Convite para acessar o Ritmo Saúde';
  const greeting = name ? `Olá, ${name}!` : 'Olá!';
  const intro = isRecovery
    ? 'Use o link abaixo para definir ou redefinir sua senha no Ritmo Saúde.'
    : 'Você foi convidado(a) a acessar o Ritmo Saúde. Use o link abaixo para criar sua senha e ativar a conta.';
  const text = `${greeting}\n\n${intro}\n\n${actionLink}\n\nSe você não esperava este e-mail, ignore-o.`;
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#122018">
<p>${greeting}</p>
<p>${intro}</p>
<p><a href="${actionLink}" style="display:inline-block;padding:12px 18px;background:#1f6b4a;color:#fff;text-decoration:none;border-radius:8px">Abrir link seguro</a></p>
<p style="word-break:break-all;font-size:13px;color:#4a6358">${actionLink}</p>
<p style="font-size:13px;color:#6b7f74">Se você não esperava este e-mail, ignore-o.</p>
</body></html>`;

  return sendAppEmail({ to, subject, html, text });
}
