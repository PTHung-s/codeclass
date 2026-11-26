/**
 * aiClient — lớp gọi AI thống nhất hỗ trợ cả:
 *  1) OpenAI-compatible Chat Completions API (`AI_API_KEY` + `AI_BASE_URL` + `AI_MODEL`)
 *  2) Google Gemini SDK (`GOOGLE_AI_API_KEY`, mặc định `gemini-flash-latest`)
 *
 * Tự động chọn OpenAI-compatible khi `AI_API_KEY` có giá trị, ngược lại fallback sang Gemini.
 */
import { GoogleGenerativeAI, type ResponseSchema } from '@google/generative-ai';

export interface AiInlineImage {
  data: string; // base64 không kèm prefix data:
  mimeType: string;
}

export interface AiChatHistoryItem {
  role: 'user' | 'model' | 'assistant';
  parts?: Array<{ text?: string }>;
  attachments?: Array<{ label?: string; content?: string; fileData?: string; mimeType?: string }>;
}

export function getAiProviderInfo(): {
  configured: boolean;
  provider: 'openai-compat' | 'gemini' | 'none';
  model: string;
} {
  const oaKey = (process.env.AI_API_KEY || '').trim();
  const oaBase = (process.env.AI_BASE_URL || '').trim();
  if (oaKey && oaBase) {
    return {
      configured: true,
      provider: 'openai-compat',
      model: (process.env.AI_MODEL || 'gpt-4o-mini').trim(),
    };
  }
  const gemKey = (process.env.GOOGLE_AI_API_KEY || '').trim();
  if (gemKey) {
    return {
      configured: true,
      provider: 'gemini',
      model: (process.env.GEMINI_MODEL || 'gemini-flash-latest').trim(),
    };
  }
  return { configured: false, provider: 'none', model: '' };
}

async function callOpenAiCompat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: any }>,
  opts?: { temperature?: number; expectJsonObject?: boolean; timeoutMs?: number },
): Promise<string> {
  const apiKey = (process.env.AI_API_KEY || '').trim();
  const baseUrl = (process.env.AI_BASE_URL || '').trim().replace(/\/+$/, '');
  const model = (process.env.AI_MODEL || 'gpt-4o-mini').trim();
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const doFetch = async (withJsonFormat: boolean) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 60_000);
    try {
      const body: Record<string, any> = {
        model,
        messages,
        temperature: opts?.temperature ?? 0.6,
      };
      if (withJsonFormat) {
        body.response_format = { type: 'json_object' };
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await doFetch(Boolean(opts?.expectJsonObject));
  // Một số gateway/model không hỗ trợ `response_format: { type: 'json_object' }` -> tự retry bỏ trường này
  if (!res.ok && opts?.expectJsonObject && (res.status === 400 || res.status === 422)) {
    res = await doFetch(false);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI upstream HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  throw new Error('AI upstream trả về nội dung trống.');
}

/** Gọi AI sinh văn bản / JSON có cấu trúc (dùng cho 3 endpoint trắc nghiệm AI) */
export async function generateStructuredText(opts: {
  prompt: string;
  image?: AiInlineImage | null;
  geminiSchema?: ResponseSchema;
  expectJsonObject?: boolean;
  temperature?: number;
}): Promise<string> {
  const info = getAiProviderInfo();
  if (!info.configured) {
    throw new Error('API Key not found');
  }

  if (info.provider === 'openai-compat') {
    const userContent = opts.image
      ? [
          { type: 'text', text: opts.prompt },
          {
            type: 'image_url',
            image_url: { url: `data:${opts.image.mimeType};base64,${opts.image.data}` },
          },
        ]
      : opts.prompt;

    const systemMsg = opts.expectJsonObject
      ? 'Bạn là hệ thống sinh dữ liệu JSON nghiêm ngặt. LUÔN trả về DUY NHẤT 1 JSON hợp lệ, không kèm văn bản giải thích bên ngoài.'
      : 'Bạn là hệ thống sinh dữ liệu JSON nghiêm ngặt. LUÔN trả về DUY NHẤT JSON hợp lệ, không kèm văn bản giải thích bên ngoài.';

    return callOpenAiCompat(
      [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userContent },
      ],
      {
        temperature: opts.temperature ?? 0.65,
        expectJsonObject: opts.expectJsonObject,
      },
    );
  }

  // Google Gemini path
  const genAI = new GoogleGenerativeAI((process.env.GOOGLE_AI_API_KEY || '').trim());
  const model = genAI.getGenerativeModel({
    model: info.model,
    generationConfig: opts.geminiSchema
      ? {
          responseMimeType: 'application/json',
          responseSchema: opts.geminiSchema,
          temperature: opts.temperature ?? 0.7,
        }
      : { temperature: opts.temperature ?? 0.7 },
  });

  const parts: any[] = [{ text: opts.prompt }];
  if (opts.image) {
    parts.push({ inlineData: opts.image });
  }
  const result = await model.generateContent(parts);
  return result.response.text();
}

/** Gọi AI trò chuyện nhiều lượt có đính kèm code / terminal / ảnh đề bài */
export async function generateChatReply(opts: {
  systemInstruction: string;
  message: string;
  history?: AiChatHistoryItem[];
  attachments?: Array<{ label?: string; content?: string; fileData?: string; mimeType?: string }>;
}): Promise<string> {
  const info = getAiProviderInfo();
  if (!info.configured) {
    throw new Error('AI API Key not configured');
  }

  if (info.provider === 'openai-compat') {
    const buildOpenAiContent = (
      baseText: string,
      attachments?: Array<{ label?: string; content?: string; fileData?: string; mimeType?: string }>,
    ) => {
      let text = baseText;
      const images: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
      if (Array.isArray(attachments)) {
        for (const att of attachments) {
          if (att?.fileData && att?.mimeType && att.mimeType.startsWith('image/')) {
            images.push({
              type: 'image_url',
              image_url: { url: `data:${att.mimeType};base64,${att.fileData}` },
            });
          } else if (att?.content) {
            text += `\n\n[Đính kèm ${att.label || 'tài liệu'}]:\n\`\`\`\n${att.content}\n\`\`\``;
          }
        }
      }
      if (images.length > 0) {
        return [{ type: 'text', text }, ...images];
      }
      return text;
    };

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: any }> = [
      { role: 'system', content: opts.systemInstruction },
    ];

    for (const item of opts.history || []) {
      const role: 'user' | 'assistant' = item.role === 'user' ? 'user' : 'assistant';
      const baseText = Array.isArray(item.parts)
        ? item.parts.map((p) => p?.text || '').join('\n')
        : String(item.parts || '');
      messages.push({
        role,
        content: buildOpenAiContent(baseText, item.attachments),
      });
    }

    messages.push({
      role: 'user',
      content: buildOpenAiContent(opts.message, opts.attachments),
    });

    return callOpenAiCompat(messages, { temperature: 0.6 });
  }

  // Google Gemini path
  const genAI = new GoogleGenerativeAI((process.env.GOOGLE_AI_API_KEY || '').trim());
  const model = genAI.getGenerativeModel({
    model: info.model,
    systemInstruction: opts.systemInstruction,
  });

  const messageParts: any[] = [{ text: opts.message }];
  if (Array.isArray(opts.attachments)) {
    opts.attachments.forEach((att) => {
      if (att.fileData && att.mimeType) {
        messageParts.push({ inlineData: { data: att.fileData, mimeType: att.mimeType } });
      } else if (att.content) {
        messageParts[0].text += `\n\n[Đính kèm ${att.label}]:\n\`\`\`\n${att.content}\n\`\`\``;
      }
    });
  }

  const sanitizedHistory = (opts.history || []).map((item) => {
    const parts: any[] = Array.isArray(item.parts)
      ? item.parts.map((p) => ({ text: p.text || '' }))
      : [{ text: String(item.parts || '') }];

    if (Array.isArray(item.attachments)) {
      item.attachments.forEach((att) => {
        if (att.fileData && att.mimeType) {
          parts.push({ inlineData: { data: att.fileData, mimeType: att.mimeType } });
        } else if (att.content) {
          parts[0].text += `\n\n[Đính kèm ${att.label}]:\n\`\`\`\n${att.content}\n\`\`\``;
        }
      });
    }
    return { role: item.role === 'assistant' ? 'model' : item.role, parts };
  });

  const chat = model.startChat({ history: sanitizedHistory });
  const result = await chat.sendMessage(messageParts);
  return result.response.text();
}
