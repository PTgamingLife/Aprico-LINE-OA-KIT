import { prints, type PrintKey } from './backgrounds.ts';
import { backgroundBytes } from './image-format.ts';
import {
  menuPresets,
  recordPresets,
  responseFormats,
  recipients,
  destinations,
  type ResponseFormat,
  type RecordRoute,
} from './design-catalog.ts';
export const themes = [
  { name: '森林鼠尾草', colors: ['#BDD0BE', '#DDD5BC', '#B9CCCF', '#D4C2B8'] },
  { name: '奶油咖啡', colors: ['#DDD0B8', '#C7B29E', '#EBE1CE', '#BFC2AF'] },
  { name: '霧藍海岸', colors: ['#B5CAD4', '#CCDADC', '#CEC9BD', '#A7BABE'] },
  { name: '乾燥玫瑰', colors: ['#D7B8B7', '#E2CCCC', '#C7B7C5', '#D8CDBC'] },
  { name: '薰衣草灰', colors: ['#C9C1D6', '#DCD5E4', '#BEC9D0', '#D3C6C2'] },
  { name: '杏桃暖陽', colors: ['#E7C5A8', '#E8D6B6', '#D6C4B9', '#C9D0B4'] },
  { name: '深藍青綠', colors: ['#A8BDCC', '#A9C9C5', '#C0D4D0', '#D4D3C4'] },
  { name: '黑白極簡', colors: ['#C3C6C5', '#DCDDD9', '#B7BDBA', '#E7E5DE'] },
];
export type Cell = {
  label: string;
  action: 'message' | 'half' | 'full' | 'web';
  template: 'custom' | 'scratch' | 'health';
  content: string;
  preset?: string;
  presetNotes?: string;
  responseFormat?: ResponseFormat;
};
export const secretaryPortraits = ['forest', 'star', 'archive', 'clockwork', 'moon'].flatMap(
  (style) => ['male', 'female'].map((gender) => style + '-' + gender),
);
export type SecretaryDesign = {
  direction: 'oa' | 'records' | 'both';
  conversation?: 'personal' | 'group' | 'both';
  features?: string;
  policy?: string;
  menuPurposes?: string[];
  routes?: RecordRoute[];
};
export type Draft = {
  name: string;
  oaName: string;
  goal?: string;
  grid: 4 | 6 | 8;
  theme: number;
  pattern: PrintKey;
  backgroundImage: string;
  cells: Cell[];
  secretary?: SecretaryDesign;
  portrait?: string;
};
export function emptyDraft(): Draft {
  return {
    name: '',
    oaName: '',
    goal: '',
    grid: 4,
    theme: 0,
    pattern: 'none',
    backgroundImage: '',
    cells: Array.from({ length: 8 }, () => ({
      label: '',
      action: 'message',
      template: 'custom',
      content: '',
    })),
  };
}
export function validateDraft(value: unknown): Draft {
  if (!value || typeof value !== 'object') throw Error('設定格式不正確');
  const v = value as Draft;
  const str = (s: unknown, max: number) => {
    if (typeof s !== 'string' || s.length > max) throw Error('欄位格式或長度不正確');
    return s;
  };
  if (
    ![4, 6, 8].includes(v.grid) ||
    !Number.isInteger(v.theme) ||
    v.theme < 0 ||
    v.theme >= themes.length ||
    !Array.isArray(v.cells) ||
    v.cells.length !== 8
  )
    throw Error('選單設定不正確');
  const pattern = v.pattern ?? 'none',
    backgroundImage = v.backgroundImage ?? '';
  if (!['none', 'image', ...prints.map((p) => p.key)].includes(pattern))
    throw Error('印花設定不正確');
  if (backgroundImage) backgroundBytes(backgroundImage);
  else if (backgroundImage !== '' || pattern === 'image') throw Error('請先上傳背景圖片');
  const secretary = v.secretary;
  if (
    secretary &&
    (!['oa', 'records', 'both'].includes(secretary.direction) ||
      (secretary.conversation !== undefined &&
        !['personal', 'group', 'both'].includes(secretary.conversation)))
  )
    throw Error('秘書用途設定不正確');
  if (
    secretary?.menuPurposes !== undefined &&
    (!Array.isArray(secretary.menuPurposes) || secretary.menuPurposes.length > 8)
  )
    throw Error('選單用途設定不正確');
  const menuPurposes = secretary?.menuPurposes?.map((p) => str(p, 30));
  const routes = secretary?.routes;
  if (
    routes !== undefined &&
    (!Array.isArray(routes) ||
      routes.length > 6 ||
      new Set(routes.map((r) => r?.id)).size !== routes.length)
  )
    throw Error('紀錄流程設定不正確');
  const cleanRoutes = routes?.map((r) => {
    if (
      !r ||
      !recordPresets.some((p) => p.id === r.id) ||
      !Object.hasOwn(responseFormats, r.format) ||
      !Object.hasOwn(recipients, r.recipient) ||
      !Object.hasOwn(destinations, r.destination) ||
      (r.destination === 'calendar' && r.id !== 'calendar') ||
      (r.id === 'life' && r.recipient === 'chat')
    )
      throw Error('紀錄流程設定不正確');
    return {
      id: r.id,
      notes: str(r.notes, 500),
      format: r.format,
      recipient: r.recipient,
      destination: r.destination,
    };
  });
  const cells = v.cells.map((c) => {
    if (
      !c ||
      !['message', 'half', 'full', 'web'].includes(c.action) ||
      !['custom', 'scratch', 'health'].includes(c.template)
    )
      throw Error('格子設定不正確');
    const preset = c.preset === undefined ? undefined : menuPresets.find((p) => p.id === c.preset);
    if (
      (c.preset !== undefined && !preset) ||
      (c.responseFormat !== undefined &&
        (!Object.hasOwn(responseFormats, c.responseFormat) ||
          (preset && !preset.formats.includes(c.responseFormat))))
    )
      throw Error('格子模板設定不正確');
    return {
      label: str(c.label, 30),
      action: c.action,
      template: c.template,
      content: str(c.content, 2000),
      ...(preset ? { preset: preset.id } : {}),
      ...(preset && c.presetNotes !== undefined ? { presetNotes: str(c.presetNotes, 500) } : {}),
      ...(c.responseFormat ? { responseFormat: c.responseFormat } : {}),
    };
  });
  if (v.portrait !== undefined && !secretaryPortraits.includes(v.portrait))
    throw Error('秘書造型不正確');
  return {
    name: str(v.name, 80),
    oaName: str(v.oaName, 80),
    goal: str(v.goal ?? '', 500).trim(),
    grid: v.grid,
    theme: v.theme,
    pattern,
    backgroundImage,
    cells,
    ...(v.portrait ? { portrait: v.portrait } : {}),
    ...(secretary
      ? {
          secretary: {
            direction: secretary.direction,
            conversation: secretary.conversation,
            features: str(secretary.features ?? '', 500),
            policy: str(secretary.policy ?? '', 500),
            menuPurposes,
            ...(cleanRoutes ? { routes: cleanRoutes } : {}),
          },
        }
      : {}),
  };
}
export const actionNames = {
  message: '聊天訊息',
  half: '半頁 App',
  full: '全頁 App',
  web: '跳轉網頁',
};
