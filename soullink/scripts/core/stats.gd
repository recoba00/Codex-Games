class_name SoulStats
extends RefCounted

static var _schema: Dictionary = {}

static func schema() -> Dictionary:
	if _schema.is_empty():
		_schema = JSON.parse_string(FileAccess.get_file_as_string("res://data/stats.json"))
	return _schema.duplicate(true)

static func defaults() -> Dictionary:
	var values: Dictionary = {}
	for definition in schema().definitions:
		values[definition.id] = definition.default
	return values

static func from_character(info: Dictionary) -> Dictionary:
	var base: Dictionary = info.get("stats", {}).duplicate(true)
	if not info.has("stats"):
		if info.has("hp"):
			base.max_hp = info.hp
		if info.has("attack"):
			base.attack = info.attack
	return resolve(base)

static func resolve(base: Dictionary, modifiers: Array = []) -> Dictionary:
	var result: Dictionary = {}
	# Flat additions are summed first; percentage additions share one multiplier.
	for definition in schema().definitions:
		var id: String = definition.id
		var flat = 0.0
		var percent = 0.0
		for modifier in modifiers:
			if modifier.get("stat", "") == id:
				flat += float(modifier.get("flat", 0))
				percent += float(modifier.get("percent", 0))
		var value = (float(base.get(id, definition.default)) + flat) * (1.0 + percent)
		if not is_finite(value):
			value = definition.default
		value = clampf(value, definition.min, definition.max)
		# Avoid losing a whole point to e.g. 100 * 1.15 = 114.99999999999999.
		result[id] = floori(value + 0.000000001) if definition.integer else value
	return result

static func mitigate(amount: float, values: Dictionary, direct_guard: float = 0, direct: bool = true) -> float:
	var value = maxf(0, amount)
	if direct:
		if _schema.is_empty():
			schema()
		var constant: float = _schema.damage_rules.defense_constant
		value *= constant / (constant + values.defense)
		value *= 1.0 - direct_guard
	return value * (1.0 - values.damage_reduction)
