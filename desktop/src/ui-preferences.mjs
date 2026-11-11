import {z} from 'zod';

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{0,240}$/);
const schemas = {
  chatSelection: z.object({profileId: identifier, requestId: identifier.nullable()}),
  chatDrafts: z.record(z.string().max(500), z.string().max(16000)),
  productionDrafts: z.record(z.string().max(260), z.object({
    mode:z.string().max(20), name:z.string().max(150), prompt:z.string().max(16000),
    role:z.string().max(20), ratio:z.string().max(10), duration:z.number().finite(),
    referenceIds:z.array(identifier).max(12), action:z.string().max(1000), camera:z.string().max(1000), voice:z.string().max(2000),
  })),
  libraryFilters: z.object({
    productId: identifier.or(z.literal('all')), type: z.enum(['all','video','image']), query: z.string().max(500), batch: z.boolean(),
    category: z.enum(['content','test','all']).default('content'), review: z.enum(['all','pending','approved','rejected','stale']).default('all'),
    period: z.enum(['all','today','week','month']).default('all'), versions: z.boolean().default(false),
  }),
  mediaOrganization: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,120}:[a-zA-Z0-9_-]{1,120}$/), z.object({
    category: z.enum(['content','test']), preferredTakeId: identifier.nullable(),
  })),
};
const keySchema = z.enum(Object.keys(schemas));

export class UiPreferences {
  constructor(store) {this.store = store;}
  load(payload) {
    const key = keySchema.parse(payload.key);
    const value = this.store.get('ui_' + key, null);
    return value === null ? null : schemas[key].parse(value);
  }
  save(payload) {
    const key = keySchema.parse(payload.key);
    const patch = payload.patch === true;
    if (patch && !['chatDrafts', 'productionDrafts', 'mediaOrganization'].includes(key)) throw Error('Mục giao diện này yêu cầu giá trị đầy đủ.');
    const validated = schemas[key].parse(payload.value);
    const value = patch ? {...this.load({key}), ...validated} : validated;
    if (JSON.stringify(value).length > 500000) throw Error('Nháp giao diện vượt 500.000 ký tự. Rút gọn các nháp cũ rồi lưu lại.');
    this.store.set('ui_' + key, value);
    return true;
  }
}
