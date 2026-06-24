import { Router } from 'express';
import express from 'express';
import { Webhook } from 'svix';
import { enviarBienvenida, enviarCorreoClerk } from '../utils/email.js';

const router = Router();

function obtenerEmailPrincipal(usuario) {
  const emails = usuario.email_addresses ?? [];
  const principal = emails.find((e) => e.id === usuario.primary_email_address_id);
  return principal?.email_address ?? emails[0]?.email_address ?? null;
}

router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  const secreto = process.env.CLERK_WEBHOOK_SECRET?.trim();

  if (!secreto) {
    return res.status(500).json({ mensaje: 'CLERK_WEBHOOK_SECRET no configurada' });
  }

  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ mensaje: 'Faltan cabeceras de verificación Svix' });
  }

  let evento;

  try {
    const wh = new Webhook(secreto);
    evento = wh.verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (error) {
    console.error('Webhook Clerk inválido:', error.message);
    return res.status(400).json({ mensaje: 'Firma de webhook inválida' });
  }

  try {
    if (evento.type === 'user.created') {
      const email = obtenerEmailPrincipal(evento.data);
      if (email) {
        const nombre = [evento.data.first_name, evento.data.last_name].filter(Boolean).join(' ');
        try {
          await enviarBienvenida({ email, nombre });
          console.log(`✓ Correo de bienvenida enviado a ${email}`);
        } catch (emailError) {
          console.error(`✗ No se pudo enviar bienvenida a ${email}:`, emailError.message);
        }
      }
    }

    if (evento.type === 'email.created') {
      const data = evento.data;

      if (data.delivered_by_clerk === false && data.to_email_address) {
        try {
          await enviarCorreoClerk({
            para: data.to_email_address,
            asunto: data.subject,
            cuerpoHtml: data.body,
            cuerpoTexto: data.body_plain ?? undefined,
          });
          console.log(`✓ Correo Clerk (${data.slug}) enviado vía Resend a ${data.to_email_address}`);
        } catch (emailError) {
          console.error(
            `✗ No se pudo enviar correo Clerk (${data.slug}) a ${data.to_email_address}:`,
            emailError.message
          );
        }
      }
    }

    return res.status(200).json({ recibido: true });
  } catch (error) {
    console.error('Error procesando webhook Clerk:', error.message);
    return res.status(500).json({ mensaje: 'Error al procesar webhook' });
  }
});

export default router;
