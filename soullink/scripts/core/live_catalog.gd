extends RefCounted

const Stats = preload("res://scripts/core/stats.gd")
const Catalog = preload("res://scripts/core/catalog.gd")

static func _object(value: Variant, keys: Array) -> bool:
	if not value is Dictionary or value.size() != keys.size():
		return false
	for key in keys:
		if not value.has(key):
			return false
	return true

static func _number(value: Variant, low: float, high: float, integer: bool = false) -> bool:
	return (value is float or value is int) and is_finite(value) and value >= low and value <= high and (not integer or value == floor(value))

static func _text(value: Variant, maximum: int) -> bool:
	if not value is String or value.strip_edges().is_empty() or value.length() > maximum:
		return false
	for index in value.length():
		if value.unicode_at(index) < 32 or value.unicode_at(index) == 127:
			return false
	return true

static func _matches(value: Variant, pattern: String) -> bool:
	if not value is String:
		return false
	var expression = RegEx.new()
	expression.compile(pattern)
	return expression.search(value) != null

static func _id(value: Variant) -> bool:
	return _matches(value, "^[a-z][a-z0-9_]{1,31}$") and value not in ["constructor", "prototype", "__proto__"]

static func _asset_id(value: Variant) -> bool:
	return value in ["ignis", "selene", "sylphi"] or _matches(value, "^asset_[a-f0-9]{64}\\.(png|jpg|webp)$")

static func validate(payload: Variant) -> bool:
	if not _object(payload, ["format_version", "schema_version", "characters", "combat", "assets", "revision"]):
		return false
	if payload.format_version != 1 or payload.schema_version != 3 or not _matches(payload.revision, "^[a-f0-9]{64}$"):
		return false
	if not _object(payload.combat, ["baseStrike", "elementBonus", "actionSeconds"]):
		return false
	if not _number(payload.combat.baseStrike, 30, 150, true) or not _number(payload.combat.elementBonus, 0, 0.1) or not _number(payload.combat.actionSeconds, 3, 10, true):
		return false
	if not payload.assets is Dictionary or payload.assets.size() > 288 or not payload.characters is Dictionary or payload.characters.size() < 2 or payload.characters.size() > 12:
		return false
	for id in payload.assets:
		var asset: Variant = payload.assets[id]
		if not _asset_id(id) or not _object(asset, ["ext", "width", "height", "bytes", "sha256", "path"]):
			return false
		if asset.ext not in ["png", "jpg", "webp"] or asset.path != "assets/" + id or not _matches(asset.sha256, "^[a-f0-9]{64}$"):
			return false
		if id.begins_with("asset_") and id != "asset_" + asset.sha256 + "." + asset.ext:
			return false
		if not _number(asset.width, 64, 2048, true) or not _number(asset.height, 64, 2048, true) or not _number(asset.bytes, 32, 3145728, true):
			return false
	for id in payload.characters:
		var info: Variant = payload.characters[id]
		if not _id(id) or not _object(info, ["name", "english", "faction", "color", "role", "skill", "enabled", "portrait", "skins", "default_skin", "stats", "active", "passive_config"]):
			return false
		if not _text(info.name, 12) or not _text(info.english, 20) or not _text(info.role, 14) or not _text(info.skill, 12) or not _matches(info.color, "^#[a-fA-F0-9]{6}$"):
			return false
		if info.enabled != true or not _number(info.faction, 0, 3, true) or not info.stats is Dictionary or info.stats.size() != Stats.defaults().size():
			return false
		for definition in Stats.schema().definitions:
			if not info.stats.has(definition.id) or not _number(info.stats[definition.id], definition.min, definition.max, definition.integer):
				return false
		if not _skins(info, payload.assets) or not _skill(info.active) or not _passive(info.passive_config):
			return false
	return true

static func _skins(info: Dictionary, assets: Dictionary) -> bool:
	if not info.skins is Dictionary or info.skins.is_empty() or info.skins.size() > 24 or not info.default_skin is String or not info.skins.has(info.default_skin):
		return false
	for id in info.skins:
		var skin: Variant = info.skins[id]
		if not _id(id) or not _object(skin, ["name", "image", "enabled"]) or not _text(skin.name, 24) or skin.enabled != true or not skin.image is String or not assets.has(skin.image):
			return false
	return info.portrait == info.skins[info.default_skin].image

static func _skill(skill: Variant) -> bool:
	return _object(skill, ["type", "damage", "cost", "threshold", "executeDamage", "boost"]) and skill.type in ["damage", "execute", "silence", "boost"] and _number(skill.damage, 0, 300, true) and _number(skill.cost, 20, 100, true) and _number(skill.threshold, 0.1, 0.5) and _number(skill.executeDamage, 0, 400, true) and _number(skill.boost, 0, 0.4)

static func _passive(passive: Variant) -> bool:
	if not _object(passive, ["type", "value", "threshold", "cap"]) or passive.type not in ["none", "burn", "guard", "combo"]:
		return false
	return _number(passive.value, 0, 30 if passive.type == "burn" else 0.4, passive.type == "burn") and _number(passive.threshold, 2 if passive.type == "combo" else 1, 5, true) and _number(passive.cap, 1, 3, true)

static func apply(base: Dictionary, payload: Dictionary) -> Dictionary:
	if not validate(payload):
		return {}
	var next = base.duplicate(true)
	next.characters = payload.characters.duplicate(true)
	next.combat = payload.combat.duplicate(true)
	next.schema_version = 3
	next.content_revision = payload.revision
	return Catalog.prepare_data(next)
