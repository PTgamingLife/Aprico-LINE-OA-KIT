// OAW app config: the strict output schema for Claude and the boundary validator.
const CELL = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'action', 'content', 'format'],
  properties: {
    label: { type: 'string' },
    action: { type: 'string', enum: ['message', 'full', 'web'] },
    content: { type: 'string' },
    format: { type: 'string', enum: ['text', 'card'] },
  },
};
export const OAW_CONFIG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['oaName', 'grid', 'theme', 'shape', 'cells', 'welcome', 'failure', 'secretary'],
  properties: {
    oaName: { type: 'string' },
    grid: { type: 'integer', enum: [4, 6, 8] },
    // Strict structured output rejects range keywords; ranges are checked by validOawConfig.
    theme: { type: 'integer' },
    // Menu cell shape: 0 方塊 1 圓角 2 拼圖 3 拱門 4 票券 5 花邊.
    shape: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] },
    cells: { type: 'array', items: CELL },
    welcome: { type: 'string' },
    failure: { type: 'string' },
    secretary: { type: 'boolean' },
  },
};

export function validOawConfig(v: any) {
  const s = (x: unknown, max: number) => typeof x === 'string' && x.length <= max;
  return (
    v &&
    s(v.oaName, 40) &&
    [4, 6, 8].includes(v.grid) &&
    Number.isInteger(v.theme) &&
    v.theme >= 0 &&
    v.theme <= 7 &&
    (v.shape === undefined || (Number.isInteger(v.shape) && v.shape >= 0 && v.shape <= 5)) &&
    s(v.welcome, 500) &&
    s(v.failure, 300) &&
    typeof v.secretary === 'boolean' &&
    Array.isArray(v.cells) &&
    v.cells.length === 8 &&
    v.cells.every(
      (c: any) =>
        c &&
        s(c.label, 20) &&
        ['message', 'full', 'web'].includes(c.action) &&
        s(c.content, 1000) &&
        (c.action !== 'web' || !c.content || /^https:\/\/\S+$/.test(c.content)) &&
        ['text', 'card'].includes(c.format),
    )
  );
}
