/** 物品存放位置：预设 + 自定义（后端不做枚举校验，只存字符串）。 */

export const LOCATION_PRESETS = [
  "厨房",
  "卫生间",
  "浴室",
  "阳台",
  "客厅",
  "卧室",
  "储物间",
  "车库",
  "冰箱旁",
  "儿童可触及处",
] as const;

/** 更新/清除（null）某件档案物品的存放位置。 */
export async function patchItemLocation(api: string, id: number, location: string | null): Promise<boolean> {
  try {
    const res = await fetch(`${api}/api/household/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
