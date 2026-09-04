import type { HouseholdProfile } from "./profile";

export type KnowledgeItem = {
  id: string;
  zh: { title: string; body: string };
  en: { title: string; body: string };
  tags: Array<keyof HouseholdProfile | "mix" | "general">;
};

export const KNOWLEDGE: KnowledgeItem[] = [
  {
    id: "mix-84-toilet",
    tags: ["mix", "general"],
    zh: { title: "84 + 洁厕灵 = 氯气", body: "含氯消毒液遇上酸性洁厕剂会放氯气。马桶是这两瓶最容易先后相遇的地方。分开存放，绝不同时倒。" },
    en: { title: "Bleach + toilet cleaner = chlorine gas", body: "Hypochlorite plus acid releases chlorine. The toilet is where these two meet. Store apart. Never pour together." },
  },
  {
    id: "cat-pyrethroid",
    tags: ["pet_cat"],
    zh: { title: "猫对氯菊酯特别敏感", body: "猫缺少代谢拟除虫菊酯的酶。普通杀虫喷雾、部分犬用跳蚤药对猫可致中毒。家有猫请选宠物专用配方。" },
    en: { title: "Cats and pyrethroids", body: "Cats cannot metabolize pyrethroids well. Household insect sprays and some dog flea products can poison a cat." },
  },
  {
    id: "cat-phenol",
    tags: ["pet_cat"],
    zh: { title: "酚类消毒剂伤猫", body: "来苏水等酚类对猫高毒，中国标签不强制写猫警示。家有猫避免酚类，改宠物可接触的消毒方式。" },
    en: { title: "Phenols and cats", body: "Phenolic disinfectants are highly toxic to cats. Labels in China often omit this. Skip phenols if you have a cat." },
  },
  {
    id: "child-lookalike",
    tags: ["infant", "child"],
    zh: { title: "疏通剂长得像饮料", body: "彩色瓶子、甜味香精，是儿童误食高发组合。高危品上锁或放到够不到的高处，永远留在原瓶。" },
    en: { title: "Drain cleaner can look like a drink", body: "Bright bottles and sweet fragrance drive child poisonings. Lock them up. Keep original packaging." },
  },
  {
    id: "pregnant-volatile",
    tags: ["pregnant", "trying_conceive"],
    zh: { title: "孕期少用密闭卫生间的强挥发剂", body: "洁厕灵、油烟净在小空间浓度高。孕期/备孕时开窗再用，人先离开再喷。" },
    en: { title: "Pregnancy and volatiles", body: "Toilet cleaners and degreasers concentrate in small bathrooms. Ventilate first; leave the room while spraying." },
  },
  {
    id: "mix-bleach-ammonia",
    tags: ["mix", "general"],
    zh: { title: "含氯不要碰含氨", body: "84 遇上氨水/部分玻璃水会生成氯胺，刺激眼鼻。不是「越脏越要一起倒」。" },
    en: { title: "Bleach vs ammonia", body: "Hypochlorite plus ammonia makes chloramines. Do not mix bleach with ammonia glass cleaners." },
  },
  {
    id: "lye-acid",
    tags: ["mix", "general"],
    zh: { title: "强碱疏通剂不要再倒酸", body: "管道疏通剂（火碱）再倒洁厕灵会剧烈放热溅射。堵了先用物理方法，不要叠加强酸强碱。" },
    en: { title: "Lye then acid = heat", body: "Drain lye plus acid can splash boiling liquid. Try a mechanical snake first." },
  },
  {
    id: "original-bottle",
    tags: ["elderly", "child", "general"],
    zh: { title: "不要倒进饮料瓶", body: "标签是安全系统的一部分。倒进矿泉水瓶，下一个人无法判断，误食风险陡增。" },
    en: { title: "Never pour into a drink bottle", body: "The label is part of the safety system. A water bottle hides the hazard from the next person." },
  },
  {
    id: "asthma-aerosol",
    tags: ["asthma"],
    zh: { title: "哮喘遇上喷雾", body: "空气清新剂、杀虫气雾剂会诱发喘息。哮喘患者请先开窗、人离开再喷，或改非气雾剂。" },
    en: { title: "Asthma and aerosols", body: "Air fresheners and insect sprays can trigger wheeze. Ventilate and leave the room, or skip aerosols." },
  },
  {
    id: "unknown-not-safe",
    tags: ["general"],
    zh: { title: "暂无法判断 ≠ 安全", body: "拍不清、没成分表时，瓶安会说「暂无法判断」。这不是绿灯。补拍标签，确认前按危险品存放。" },
    en: { title: "Unknown is not safe", body: "If the label is unreadable we say UNKNOWN. That is not a green light. Store it as hazardous until confirmed." },
  },
];

export function pickDaily(profile: HouseholdProfile, date = new Date()): KnowledgeItem {
  const day = Math.floor(date.getTime() / 86400000);
  const weighted: KnowledgeItem[] = [];
  for (const item of KNOWLEDGE) {
    let w = 1;
    for (const tag of item.tags) {
      if (tag !== "mix" && tag !== "general" && profile[tag]) w += 3;
    }
    for (let i = 0; i < w; i++) weighted.push(item);
  }
  return weighted[Math.abs(day) % weighted.length] ?? KNOWLEDGE[0];
}
