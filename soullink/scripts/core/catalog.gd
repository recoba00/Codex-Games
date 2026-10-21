class_name SoulCatalog
extends RefCounted

const Stats = preload("res://scripts/core/stats.gd")
static var remote_textures: Dictionary = {}

static func trim_textures(keep: Array) -> void:
	for id in remote_textures.keys():
		if not id in keep:
			remote_textures.erase(id)

static func load_data() -> Dictionary:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	return prepare_data(data)

static func prepare_data(source: Dictionary) -> Dictionary:
	var data = source.duplicate(true)
	for info in data.characters.values():
		info.stats = Stats.from_character(info)
		info.erase("hp")
		info.erase("attack")
		if not info.has("skins"):
			info.skins = {"base": {"name": "기본", "image": info.get("portrait", "ignis"), "enabled": true}}
			info.default_skin = "base"
	var rules: Dictionary = data.block_rules
	var descriptions = [
		"3매치 · 마지막 타격 +%d · 기본 타격 %d × 공격력 / 100" % [rules.attack, data.combat.baseStrike],
		"3매치 · 상대 MP −%d · 턴당 최대 −%d" % [rules.denial, rules.denialCap],
		"3매치 · 다음 내 타격 +%d%% · 최대 +%d%%" % [roundi(rules.green * 100), roundi(rules.greenCap * 100)],
		"3매치 · 내 MP 추가 +%d · 매칭 후 스킬 사용 또는 보유" % rules.mana,
		"3매치 · 내 HP +%d · 턴당 최대 +%d · 부활 불가" % [rules.heal, rules.healCap]]
	for index in range(data.blocks.size()):
		data.blocks[index].description = descriptions[index]
	return data

static func skin_id(info: Dictionary, selected: String = "") -> String:
	var skins: Dictionary = info.get("skins", {})
	if skins.has(selected) and skins[selected].enabled:
		return selected
	return info.get("default_skin", "base")

static func image_id(info: Dictionary, selected: String = "") -> String:
	var skins: Dictionary = info.get("skins", {})
	var chosen = skin_id(info, selected)
	return skins[chosen].image if skins.has(chosen) else info.get("portrait", "ignis")

static func portrait(info: Dictionary, selected: String = "") -> Texture2D:
	var id = image_id(info, selected)
	if remote_textures.has(id):
		return remote_textures[id]
	if id in ["ignis", "selene", "sylphi"]:
		return load("res://assets/characters/" + id + ".webp")
	if id.begins_with("asset_") and id.is_valid_filename():
		var bundled = "res://assets/catalog/" + id
		if ResourceLoader.exists(bundled):
			return load(bundled)
	return null

static func passive_text(info: Dictionary) -> String:
	var passive: Dictionary = info.passive_config
	match String(passive.type):
		"burn": return "빨강 매치 후 타격에 화상 · 중첩당 %d 피해" % passive.value
		"guard": return "받는 직접 피해 %d%% 감소" % roundi(passive.value * 100)
		"combo": return "직접 만든 %d콤보부터 이번 타격 +%d%%" % [passive.threshold, roundi(passive.value * 100)]
	return "패시브 없음"

static func active_text(info: Dictionary, values: Dictionary = {}) -> String:
	var skill: Dictionary = info.active
	var scale: float = (Stats.from_character(info) if values.is_empty() else values).attack / 100.0
	var suffix = ""
	match String(skill.type):
		"execute": suffix = " · 적 HP %d%% 이하 %d" % [roundi(skill.threshold * 100), floori(skill.executeDamage * scale)]
		"silence": suffix = " · 다음 상대 스킬 봉인"
		"boost": suffix = " · 다음 내 타격 +%d%%" % roundi(skill.boost * 100)
	return "기본 피해 %d%s · MP %d" % [floori(skill.damage * scale), suffix, skill.cost]

static func stats_text(info: Dictionary, values: Dictionary = {}) -> String:
	if values.is_empty():
		values = Stats.from_character(info)
	var lines: PackedStringArray = []
	for definition in Stats.schema().definitions:
		var percent: bool = definition.unit == "percent"
		var amount: float = values[definition.id] * (100 if percent else 1)
		lines.append("%s %s%s" % [definition.label, String.num(amount, 1).trim_suffix(".0"), "%" if percent else ""])
	var rows: PackedStringArray = []
	for index in range(0, lines.size(), 2):
		rows.append(lines[index] + (" · " + lines[index + 1] if index + 1 < lines.size() else ""))
	return "\n".join(rows)
