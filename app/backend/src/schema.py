from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Product(BaseModel):
    name: str | None = None
    brand: str | None = None
    category: str | None = None
    barcode: str | None = None
    manufacturer: str | None = None


class Hazard(BaseModel):
    type: str
    severity: Literal["low", "medium", "high", "critical"]
    evidence: str
    confidence: float = Field(ge=0, le=1)


class Ingredient(BaseModel):
    name: str
    source: Literal["label", "database", "inferred"]
    confidence: float = Field(ge=0, le=1)


class FirstAid(BaseModel):
    ingestion: str | None = None
    inhalation: str | None = None
    eye_contact: str | None = None
    skin_contact: str | None = None


class ChemicalAnalysis(BaseModel):
    product: Product
    visual_evidence: list[str] = Field(default_factory=list)
    hazards: list[Hazard] = Field(default_factory=list)
    ingredients: list[Ingredient] = Field(default_factory=list)
    signal_words: list[str] = Field(default_factory=list)
    safe_storage: list[str] = Field(default_factory=list)
    do_not_mix_with: list[str] = Field(default_factory=list)
    first_aid: FirstAid = Field(default_factory=FirstAid)
    uncertainties: list[str] = Field(default_factory=list)
    needs_more_images: list[str] = Field(default_factory=list)
    risk_level: Literal["unknown", "low", "medium", "high", "critical"]
    summary: str


SYSTEM_PROMPT = """你是家庭化学品安全识别助手。请观察图片并只输出一个符合下列结构的 JSON 对象，字段名、层级和枚举值不得改变：
{"product":{"name":null,"brand":null,"category":null,"barcode":null,"manufacturer":null},"visual_evidence":[],"hazards":[],"ingredients":[],"signal_words":[],"safe_storage":[],"do_not_mix_with":[],"first_aid":{"ingestion":null,"inhalation":null,"eye_contact":null,"skin_contact":null},"uncertainties":[],"needs_more_images":[],"risk_level":"unknown","summary":"string"}
规则：
1. 只陈述图片中可见、标签可读或资料明确支持的事实，不要猜测不可见成分或浓度。
2. 无法确认时写入 uncertainties，并在 needs_more_images 中说明还需要拍摄的位置。
3. 风险宁可保守召回，但证据、置信度和不确定性必须分开表达。
4. 不提供危险配制、规避监管或伤害他人的步骤。
5. 急性暴露建议联系当地急救/中毒咨询机构；不要把输出称为医疗诊断。
6. 输出必须是合法 JSON，不要使用 Markdown 代码块，不得增加结构中不存在的顶层字段。
7. 如果图片不是家庭化学品，product.category 写“非家庭化学品”，risk_level 写“unknown”，并明确说明不能进行产品风险判断。
8. hazards 每项只能包含 type、severity、evidence、confidence，severity 只能取 low、medium、high、critical；ingredients 每项只能包含 name、source、confidence，source 只能取 label、database、inferred。"""


USER_PROMPT = """识别这件家庭化学品，提取产品与标签信息，判断风险并给出储存、禁忌混用和急性暴露建议。严格按训练数据中的 JSON 字段输出。"""
