import type { Channel, NotificationEvent } from './events';

const COLOR: Record<string, number> = { info: 0x3b82f6, success: 0x22c55e, warning: 0xf59e0b, error: 0xef4444 };
// Coloured status dot for Google Chat card headers (Chat has no colour API → emoji).
const DOT: Record<string, string> = { info: '🔵', success: '🟢', warning: '🟡', error: '🔴' };

/** Build the channel-specific webhook payload + target (for Telegram the url carries token/chat). */
export function formatPayload(
  channel: Channel,
  ev: NotificationEvent,
  telegram?: { botToken: string; chatId: string },
) {
  const fieldsText = ev.fields
    ? Object.entries(ev.fields)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '';
  const text = `*${ev.title}*\n${ev.message}${fieldsText ? `\n${fieldsText}` : ''}${ev.url ? `\n${ev.url}` : ''}`;

  switch (channel) {
    case 'discord':
      return {
        body: {
          embeds: [
            {
              title: ev.title,
              description: ev.message + (ev.url ? `\n${ev.url}` : ''),
              color: COLOR[ev.severity ?? 'info'],
              fields: ev.fields
                ? Object.entries(ev.fields).map(([name, value]) => ({ name, value: String(value), inline: true }))
                : [],
            },
          ],
        },
      };
    case 'slack':
      return { body: { text } };
    case 'google_chat': {
      // Rich cardsV2 message (header + key/value widgets + link button), text fallback for clients
      // that don't render cards.
      const widgets: Record<string, unknown>[] = [{ textParagraph: { text: ev.message } }];
      if (ev.fields) {
        for (const [k, v] of Object.entries(ev.fields)) {
          widgets.push({ decoratedText: { topLabel: k, text: String(v) } });
        }
      }
      if (ev.url) {
        widgets.push({
          buttonList: { buttons: [{ text: 'View', onClick: { openLink: { url: ev.url } } }] },
        });
      }
      return {
        body: {
          text,
          cardsV2: [
            {
              cardId: ev.type,
              card: {
                header: { title: `${DOT[ev.severity ?? 'info']} ${ev.title}`, subtitle: 'vacti' },
                sections: [{ widgets }],
              },
            },
          ],
        },
      };
    }
    case 'telegram': {
      // Plain text, NO parse_mode: notification content (vuln names, URLs with `_`, unbalanced `*`)
      // routinely breaks Telegram's legacy Markdown parser, which 400s the whole message. The
      // title/fields are sent unformatted instead so delivery is reliable.
      const tgText = `${ev.title}\n${ev.message}${fieldsText ? `\n${fieldsText}` : ''}${ev.url ? `\n${ev.url}` : ''}`;
      return {
        overrideUrl: telegram ? `https://api.telegram.org/bot${telegram.botToken}/sendMessage` : undefined,
        body: { chat_id: telegram?.chatId, text: tgText },
      };
    }
    default:
      return {
        body: {
          event: ev.type,
          title: ev.title,
          message: ev.message,
          severity: ev.severity,
          url: ev.url,
          fields: ev.fields,
        },
      };
  }
}
