class_name SoulRemoteBattle
extends RefCounted

const Board = preload("res://scripts/core/board.gd")

var state_version = -1
var seat = -1
var seed_value = 0
var dimensions = Vector2i(6, 5)
var data: Dictionary = {}
var fighters: Array = []
var boards: Array = []
var round_number = 1
var actor = 0
var first = 0
var actions_this_round = 0
var turn_seconds = 15.0
var turn_deadline = 0
var stage = "puzzle"
var pending: Dictionary = {}
var result: Variant = null
var records: Array = []
var ai_intent = {"active": false, "spell": false}

func _init(state: Dictionary = {}) -> void:
	if not state.is_empty():
		apply_state(state)

func apply_state(state: Dictionary) -> void:
	var match_data: Dictionary = state.get("match", {})
	if match_data.is_empty():
		return
	seat = int(state.get("youSeat", 0))
	state_version = int(state.get("version", state_version + 1))
	seed_value = int(match_data.get("seed", 0))
	data = match_data.get("catalog", {}).duplicate(true)
	var size_data: Dictionary = match_data.get("dimensions", {})
	dimensions = Vector2i(int(size_data.get("cols", 6)), int(size_data.get("rows", 5)))
	var server_fighters: Array = match_data.get("fighters", [])
	var server_boards: Array = match_data.get("boards", [])
	fighters = []
	boards = []
	for visual_side in range(2):
		var server_side = seat if visual_side == 0 else 1 - seat
		fighters.append(_fighter(server_fighters[server_side] if server_side < server_fighters.size() else {}))
		boards.append((server_boards[server_side] if server_side < server_boards.size() else []).duplicate())
	round_number = int(match_data.get("round", 1))
	actions_this_round = int(match_data.get("actionsThisRound", 0))
	actor = _visual_side(int(match_data.get("actor", seat)))
	first = _visual_side(int(match_data.get("first", seat)))
	turn_seconds = float(data.get("practice", {}).get("turnSeconds", 15.0))
	turn_deadline = int(match_data.get("turnDeadline", 0))
	stage = String(match_data.get("stage", "puzzle"))
	pending = _pending(match_data.get("pending"), actor)
	result = _result(match_data.get("result"))
	var completed_turns = maxi(0, (round_number - 1) * 2 + actions_this_round)
	while records.size() < completed_turns:
		records.append({"healing": 0, "actor": 0, "strike": {}, "damage": 0})

func record_receipt(receipt: Dictionary) -> void:
	if String(receipt.get("type", "")) != "turn":
		return
	var entry: Dictionary = receipt.get("pending", {}).duplicate(true)
	entry["actor"] = _visual_side(int(receipt.get("seat", seat)))
	entry["strike"] = receipt.get("strike", {}).duplicate(true)
	entry["damage"] = int(entry.strike.get("damage", 0))
	entry["healing"] = int(entry.get("healing", 0))
	if not records.is_empty() and records.back().get("strike", {}).is_empty():
		records[records.size() - 1] = entry
	else:
		records.append(entry)

func can_use(kind: String) -> bool:
	if result != null or actor != 0 or fighters.is_empty() or kind != "active":
		return false
	var unit: Dictionary = fighters[0]
	var info: Dictionary = data.get("characters", {}).get(unit.character, {})
	return stage == "action" and unit.hp > 0 and unit.silenceTurns == 0 and unit.mana >= int(info.get("active", {}).get("cost", 999))

func preview_damage_range(groups: Array) -> Dictionary:
	if fighters.size() < 2:
		return {"min": 0, "max": 0}
	var source: Dictionary = fighters[actor]
	var target: Dictionary = fighters[1 - actor]
	var rules: Dictionary = data.get("block_rules", {})
	var combo = Board.combo_multiplier(groups.size())
	var extra = 0.0
	for group in groups:
		if int(group.get("color", -1)) == 0:
			extra += float(rules.get("attack", 0)) * Board.size_multiplier(group.get("cells", []).size()) * combo
	var manual_combo = int(pending.get("manualCombo", 0)) if stage == "action" else groups.filter(func(group): return int(group.get("wave", 0)) == 0).size()
	var source_info: Dictionary = data.get("characters", {}).get(source.character, {})
	var target_info: Dictionary = data.get("characters", {}).get(target.character, {})
	var passive: Dictionary = source_info.get("passive_config", {})
	var combo_boost = float(passive.get("value", 0)) if passive.get("type", "") == "combo" and manual_combo >= int(passive.get("threshold", 3)) else 0.0
	var amount = (float(data.get("combat", {}).get("baseStrike", 0)) + extra) * float(source.stats.get("attack", 100)) / 100.0
	amount *= 1.0 + minf(0.8, float(pending.get("green", 0)) + float(pending.get("boost", 0)) + combo_boost)
	var source_faction = int(source_info.get("faction", -1))
	var target_faction = int(target_info.get("faction", -1))
	var advantage = (source_faction == 0 and target_faction == 2) or (source_faction == 2 and target_faction == 1) or (source_faction == 1 and target_faction == 0)
	if advantage:
		amount *= 1.0 + float(data.get("combat", {}).get("elementBonus", 0))
	var guard = float(target_info.get("passive_config", {}).get("value", 0)) if target_info.get("passive_config", {}).get("type", "") == "guard" else 0.0
	amount *= 100.0 / (100.0 + float(target.stats.get("defense", 0)))
	amount *= 1.0 - clampf(guard, 0, 0.95)
	amount *= 1.0 - clampf(float(target.stats.get("damage_reduction", 0)), 0, 0.95)
	var low = _capped_damage(amount, target)
	var high = _capped_damage(amount * float(source.stats.get("crit_damage", 1.5)), target) if float(source.stats.get("crit_chance", 0)) > 0 else low
	return {"min": low, "max": high}

func _capped_damage(amount: float, target: Dictionary) -> int:
	var after_shield = maxi(0, floori(amount) - int(target.get("shield", 0)))
	return mini(int(target.get("hp", 0)), mini(int(data.get("game_limits", {}).get("direct_hp_cap", 500)), after_shield))

func _fighter(server_fighter: Dictionary) -> Dictionary:
	var unit = server_fighter.duplicate(true)
	unit["character"] = String(server_fighter.get("characterId", ""))
	unit["barrierExpires"] = 0
	unit["spell"] = "smite"
	unit["spellUsed"] = true
	for key in ["hp", "maxHp", "mana", "shield", "burn", "burnDamage", "burnExpires", "silenceTurns", "damage", "maxCombo", "activeUses"]:
		unit[key] = int(unit.get(key, 0))
	unit["nextGreen"] = float(unit.get("nextGreen", 0))
	unit["nextBoost"] = float(unit.get("nextBoost", 0))
	return unit

func _pending(value: Variant, visual_actor: int) -> Dictionary:
	if not value is Dictionary:
		return {}
	var output: Dictionary = value.duplicate(true)
	output["actor"] = visual_actor
	output["healing"] = int(output.get("healing", 0))
	output["manaGain"] = int(output.get("manaGain", 0))
	output["manaDenied"] = int(output.get("manaDenied", 0))
	output["manualCombo"] = int(output.get("manualCombo", 0))
	return output

func _result(value: Variant) -> Variant:
	if not value is Dictionary:
		return null
	var winner = value.get("winnerSeat")
	if winner == null:
		return "draw"
	return "player" if int(winner) == seat else "ai"

func _visual_side(server_side: int) -> int:
	return 0 if server_side == seat else 1
