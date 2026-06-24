import { Resend } from 'resend';

let cliente = null;

function obtenerCliente() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY no configurada');
  }

  if (!cliente) {
    cliente = new Resend(apiKey);
  }

  return cliente;
}

function remitentePorDefecto() {
  return process.env.RESEND_FROM?.trim() || 'Proyecto Vibe <onboarding@resend.dev>';
}

export async function enviarCorreo({ para, asunto, html, texto }) {
  const resend = obtenerCliente();

  const { data, error } = await resend.emails.send({
    from: remitentePorDefecto(),
    to: para,
    subject: asunto,
    html,
    text: texto,
  });

  if (error) {
    throw new Error(error.message || 'Error al enviar correo con Resend');
  }

  return data;
}

export async function enviarBienvenida({ email, nombre }) {
  const saludo = nombre?.trim() || 'Usuario';

  return enviarCorreo({
    para: email,
    asunto: 'Bienvenido a Proyecto Vibe',
    texto: `Hola ${saludo},\n\nTu cuenta fue creada correctamente. Ya puedes iniciar sesión en el sistema de administración.\n\n— Proyecto Vibe`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #4f46e5; margin-bottom: 8px;">Bienvenido a Proyecto Vibe</h1>
        <p>Hola <strong>${saludo}</strong>,</p>
        <p>Tu cuenta fue creada correctamente. Ya puedes iniciar sesión en el sistema de administración.</p>
        <p style="color: #64748b; font-size: 14px;">— Proyecto Vibe</p>
      </div>
    `,
  });
}

export async function enviarCorreoClerk({ para, asunto, cuerpoHtml, cuerpoTexto }) {
  return enviarCorreo({
    para,
    asunto,
    html: cuerpoHtml,
    texto: cuerpoTexto,
  });
}

export function resendConfigurado() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}
