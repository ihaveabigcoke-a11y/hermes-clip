import {randomUUID} from 'node:crypto';
import {z} from 'zod';

const input = z.object({
  model: z.string().trim().max(120).regex(/^[a-zA-Z0-9._/-]*$/),
  dailyLimit: z.number().int().min(0).max(20),
  apiKey: z.string().trim().max(500).default(''),
  clearKey: z.boolean().default(false),
});

export class AssistantSettings {
  constructor(store, secret) { this.store = store; this.secret = secret; this.saving = false; }
  status() {
    const value = this.store.get('assistant_settings', {});
    return {model: value.model ?? '', dailyLimit: value.dailyLimit ?? 0, hasKey: !!value.encryptedKey,
      configured: !!value.encryptedKey && !!value.model && value.dailyLimit > 0};
  }
  async save(payload) {
    const value = input.parse(payload);
    if (this.saving) throw Error('Chờ cấu hình đang lưu hoàn tất.');
    this.saving = true;
    try {
      const previous = this.store.get('assistant_settings', {});
      let encryptedKey = previous.encryptedKey ?? '';
      if (value.clearKey) encryptedKey = '';
      else if (value.apiKey) encryptedKey = await this.secret.encrypt(value.apiKey);
      this.store.set('assistant_settings', {model: value.model, dailyLimit: value.dailyLimit, encryptedKey, configId: randomUUID()});
      return this.status();
    } finally { this.saving = false; }
  }
  async environment() {
    const value = this.store.get('assistant_settings', {});
    return {TEXT_MODEL: value.model ?? '', TEXT_DAILY_LIMIT: String(value.dailyLimit ?? 0),
      TEXT_API_KEY: value.encryptedKey ? await this.secret.decrypt(value.encryptedKey) : '',
      TEXT_CONFIG_ID: value.configId ?? ''};
  }
}
