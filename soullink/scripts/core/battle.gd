class_name SoulBattle
extends RefCounted

const Board = preload("res://scripts/core/board.gd")
const Refill = preload("res://scripts/core/refill.gd")
const Catalog = preload("res://scripts/core/catalog.gd")
const Stats = preload("res://scripts/core/stats.gd")
const RandomStream = preload("res://scripts/core/random_stream.gd")

var seed_value: int
var dimensions: Vector2i
var data: Dictionary
var rules: Dictionary
var block_rules: Dictionary
var fighters: Array = []
var boards: Array = []
var refills: Array = []
var round_number = 1
var actor = 0
var first = 0
var actions_this_round = 0
var turn_seconds = 15.0
var green = 0.0
var boost = 0.0
var special = ""
var special_damage = 0
var hp_loss = 0
var result: Variant = null
var records: Array = []
var last_waves: Array = []
var last_effects: Array = []
var last_round_effects: Array = []
var last_strike: Dictionary = {}
var stage = "puzzle"
var pending: Dictionary = {}
var ai_intent: Dictionary = {}
var turn_damage_before = 0
var combat_random: RefCounted
var last_hit: Dictionary = {}
var last_special_hit: Dictionary = {}

func _init(new_seed: int = 1001, size_value: Vector2i = Vector2i(6, 5), player: String = "ignis", opponent: String = "selene", spell: String = "smite", first_side: int = 0, color_count: int = 5, configuration: Dictionary = {}) -> void:
	seed_value = new_seed
	combat_random = RandomStream.new(seed_value ^ 0x4cf1d)
	dimensions = size_value
	data = (Catalog.load_data() if configuration.is_empty() else configuration).duplicate(true)
	rules = data.practice
	block_rules = data.block_rules
	fighters = [_fighter(player, spell), _fighter(opponent, "smite")]
	for unit in fighters:
		unit.mana = rules.openingMana
	fighters[1 - first_side].mana = mini(100, rules.openingMana + rules.secondMana)
	boards = [Board.create_board(dimensions, seed_value ^ 0x18f61, seed_value, color_count), Board.create_board(dimensions, seed_value ^ 0x35c97, seed_value, color_count)]
	refills = [Refill.new(seed_value ^ 0x716c1, color_count), Refill.new(seed_value ^ 0x84ac3, color_count)]
	first = first_side
	actor = first_side
	_start_turn()

func _fighter(character: String, spell: String) -> Dictionary:
	var info: Dictionary = data.characters[character]
	var values = Stats.from_character(info)
	return {"character": character, "stats": values, "hp": int(values.max_hp), "maxHp": int(values.max_hp), "mana": 0, "shield": 0, "barrierExpires": 0, "burn": 0, "burnDamage": 0, "burnExpires": 0,
		"silenceTurns": 0, "nextGreen": 0.0, "nextBoost": 0.0,
		"spell": spell, "spellUsed": false, "damage": 0, "maxCombo": 0, "activeUses": 0}

func _start_turn() -> void:
	var unit: Dictionary = fighters[actor]
	green = unit.nextGreen
	boost = unit.nextBoost
	turn_seconds = rules.turnSeconds
	unit.nextGreen = 0.0
	unit.nextBoost = 0.0
	special = ""
	special_damage = 0
	hp_loss = 0
	turn_damage_before = unit.damage
	stage = "puzzle"
	pending = {}
	if actor == 0 or ai_intent.is_empty():
		var enemy: Dictionary = fighters[1]
		var skill: Dictionary = data.characters[enemy.character].active
		ai_intent = {"active": enemy.mana >= skill.cost and enemy.silenceTurns == 0, "cost": skill.cost, "spell": not enemy.spellUsed and round_number >= 2}

func can_use(kind: String) -> bool:
	if result != null or kind not in ["active", "spell"] or fighters[actor].hp <= 0:
		return false
	var unit: Dictionary = fighters[actor]
	if kind == "active":
		return stage == "action" and unit.mana >= data.characters[unit.character].active.cost and unit.silenceTurns == 0
	return not unit.spellUsed and (unit.spell != "reshape" or stage == "puzzle")

func _hit(amount: float, faction: bool, hp: int, shield: int, already_lost: int, critical: bool = false) -> Dictionary:
	var source_faction: int = data.characters[fighters[actor].character].faction
	var target_info: Dictionary = data.characters[fighters[1 - actor].character]
	var target_faction: int = target_info.faction
	var advantage = (source_faction == 0 and target_faction == 2) or (source_faction == 2 and target_faction == 1) or (source_faction == 1 and target_faction == 0)
	var faction_factor: float = 1.0 + data.combat.elementBonus if faction and advantage else 1.0
	var guard: float = target_info.passive_config.value if target_info.passive_config.type == "guard" else 0.0
	var crit_factor: float = fighters[actor].stats.crit_damage if critical else 1.0
	var value = maxi(0, floori(Stats.mitigate(amount * faction_factor * crit_factor, fighters[1 - actor].stats, guard)))
	if already_lost >= data.game_limits.direct_hp_cap or hp <= 0:
		return {"actual": 0, "shield": shield, "critical": false}
	var absorbed = mini(shield, value)
	return {"actual": mini(hp, mini(data.game_limits.direct_hp_cap - already_lost, value - absorbed)), "shield": shield - absorbed, "critical": critical}

func _damage(amount: float, faction: bool = true, can_crit: bool = true) -> int:
	var target: Dictionary = fighters[1 - actor]
	var chance: float = fighters[actor].stats.crit_chance
	var eligible: bool = can_crit and amount > 0 and target.hp > 0 and hp_loss < data.game_limits.direct_hp_cap and chance > 0
	var critical: bool = combat_random.next() < chance if eligible else false
	var hit = _hit(amount, faction, target.hp, target.shield, hp_loss, critical)
	last_hit = hit.duplicate(true)
	target.hp -= hit.actual
	target.shield = hit.shield
	hp_loss += hit.actual
	fighters[actor].damage += hit.actual
	_check_knockout()
	return hit.actual

func _check_knockout() -> void:
	if fighters[0].hp <= 0 or fighters[1].hp <= 0:
		result = "draw" if fighters[0].hp == fighters[1].hp else ("player" if fighters[1].hp <= 0 else "ai")

func use(kind: String) -> bool:
	if not can_use(kind):
		return false
	var unit: Dictionary = fighters[actor]
	var target: Dictionary = fighters[1 - actor]
	if kind == "spell" and unit.spell == "reshape":
		return false
	special = kind
	if kind == "spell":
		unit.spellUsed = true
		if unit.spell == "smite":
			special_damage += _damage(100, false, false)
			last_special_hit = last_hit.duplicate(true)
		else:
			last_special_hit = {"critical": false}
			unit.shield = mini(200, unit.shield + 150)
			unit.barrierExpires = round_number + 1
		return true
	var skill: Dictionary = data.characters[unit.character].active
	unit.mana -= int(skill.cost)
	unit.activeUses += 1
	var amount: float = skill.damage
	if skill.type == "execute" and target.hp <= target.maxHp * skill.threshold:
		amount = skill.executeDamage
	special_damage += _damage(amount * unit.stats.attack / 100.0)
	last_special_hit = last_hit.duplicate(true)
	if target.hp > 0 and skill.type == "silence":
		target.silenceTurns = 1
	if skill.type == "boost":
		unit.nextBoost = maxf(unit.nextBoost, skill.boost)
	return true

func reshape(cells: Array, color: int) -> bool:
	if stage != "puzzle" or not can_use("spell") or fighters[actor].spell != "reshape" or color < 0 or color >= 5 or cells.is_empty() or cells.size() > 2:
		return false
	var seen: Dictionary = {}
	for cell in cells:
		if typeof(cell) != TYPE_INT or cell < 0 or cell >= dimensions.x * dimensions.y or seen.has(cell):
			return false
		seen[cell] = true
	for cell in cells:
		boards[actor][cell] = color
	fighters[actor].spellUsed = true
	special = "reshape"
	return true

func _strike_amount(groups: Array, manual_combo: int) -> float:
	var extra = 0.0
	for group in groups:
		if group.color == 0:
			extra += block_rules.attack * Board.size_multiplier(group.cells.size()) * Board.combo_multiplier(groups.size())
	var passive: Dictionary = data.characters[fighters[actor].character].passive_config
	var combo_boost: float = passive.value if passive.type == "combo" and manual_combo >= passive.threshold else 0.0
	return (data.combat.baseStrike + extra) * fighters[actor].stats.attack / 100.0 * (1.0 + minf(0.8, green + boost + combo_boost))

func preview_damage(groups: Array) -> int:
	return preview_damage_range(groups).min

func preview_damage_range(groups: Array) -> Dictionary:
	var manual = 0
	for group in groups:
		if int(group.get("wave", 0)) == 0:
			manual += 1
	if stage == "action":
		manual = pending.manualCombo
	var target: Dictionary = fighters[1 - actor]
	var amount = _strike_amount(groups, manual)
	var chance: float = fighters[actor].stats.crit_chance
	var low: int = _hit(amount, true, target.hp, target.shield, hp_loss, chance >= 1.0).actual
	var high: int = _hit(amount, true, target.hp, target.shield, hp_loss, chance > 0).actual
	return {"min": low, "max": high}

func resolve_puzzle(path: Array, timed_out: bool = false) -> Dictionary:
	if result != null or stage != "puzzle" or path.size() > maxi(0, floori((turn_seconds - 0.5) * 8)) + 1:
		return {}
	if fighters[actor].hp <= 0 or fighters[1 - actor].hp <= 0:
		_check_knockout()
		return {}
	for index in range(path.size()):
		var cell = int(path[index])
		if cell != path[index] or cell < 0 or cell >= dimensions.x * dimensions.y or (index > 0 and not Board.adjacent(path[index - 1], cell, dimensions)):
			return {}
	var board: Array = boards[actor].duplicate()
	for index in range(1, path.size()):
		board = Board.moved(board, path[index - 1], path[index])
	var assisted = false
	if timed_out and actor == 0 and Board.find_groups(board, dimensions).is_empty():
		var correction = Board.simple_match(board, dimensions)
		if correction.is_empty():
			board = boards[actor].duplicate()
			correction = Board.simple_match(board, dimensions)
		if not correction.is_empty():
			board = Board.moved(board, correction[0], correction[1])
			assisted = true
	var resolution = Board.resolve(board, dimensions, refills[actor])
	last_waves = resolution.waves
	boards[actor] = resolution.board
	var mana_gain = 0
	var mana_denied = 0
	var healing = 0
	var next_green = 0.0
	var manual_combo = 0
	var unit: Dictionary = fighters[actor]
	var target: Dictionary = fighters[1 - actor]
	var combo = Board.combo_multiplier(resolution.groups.size())
	last_effects = []
	last_round_effects = []
	last_strike = {}
	for group in resolution.groups:
		if group.wave == 0 and not assisted and path.size() >= 2:
			manual_combo += 1
		var before = {"mana": unit.mana, "enemyMana": target.mana, "green": next_green, "ownHp": unit.hp}
		var multiplier = Board.size_multiplier(group.cells.size()) * combo
		var base_mana = mini(100 - unit.mana, mini(block_rules.manaCap - mana_gain, rules.matchMana))
		unit.mana += base_mana
		mana_gain += base_mana
		match int(group.color):
			1:
				var denied = mini(target.mana, mini(block_rules.denialCap - mana_denied, floori(block_rules.denial * multiplier)))
				target.mana -= denied
				mana_denied += denied
			2:
				next_green = minf(block_rules.greenCap, next_green + block_rules.green * multiplier)
			3:
				var gained = mini(100 - unit.mana, mini(block_rules.manaCap - mana_gain, floori(block_rules.mana * multiplier)))
				unit.mana += gained
				mana_gain += gained
			4:
				var healed = mini(unit.maxHp - unit.hp, mini(block_rules.healCap - healing, floori(block_rules.heal * multiplier))) if unit.hp > 0 else 0
				unit.hp += healed
				healing += healed
		last_effects.append({"actor": actor, "color": int(group.color), "cells": group.cells.duplicate(), "wave": group.wave,
			"damage": 0, "shield": 0, "attackBonus": floori(block_rules.attack * multiplier) if group.color == 0 else 0,
			"mana": unit.mana - before.mana, "baseMana": base_mana, "denied": before.enemyMana - target.mana,
			"green": next_green - before.green, "burn": 0, "enemyManaBefore": before.enemyMana, "manaFull": unit.mana == 100,
			"targetDefeated": false, "healed": unit.hp - before.ownHp, "hpBefore": before.ownHp, "hpFull": unit.hp == unit.maxHp})
	unit.nextGreen = next_green
	unit.maxCombo = maxi(unit.maxCombo, manual_combo)
	pending = {"actor": actor, "round": round_number, "path": path.duplicate(), "special": special, "groups": resolution.groups,
		"damage": unit.damage - turn_damage_before, "manaGain": mana_gain, "manaDenied": mana_denied, "green": next_green, "healing": healing,
		"shuffled": resolution.shuffled, "timeout": timed_out, "assisted": assisted, "manualCombo": manual_combo}
	stage = "action"
	return pending.duplicate(true)

func commit_turn() -> Dictionary:
	if stage != "action" or pending.is_empty():
		return {}
	var unit: Dictionary = fighters[actor]
	var target: Dictionary = fighters[1 - actor]
	var before_shield: int = target.shield
	var dealt = 0
	var burn_added = 0
	var critical = false
	var passive: Dictionary = data.characters[unit.character].passive_config
	var combo_active: bool = passive.type == "combo" and pending.manualCombo >= passive.threshold
	if result == null:
		dealt = _damage(_strike_amount(pending.groups, pending.manualCombo))
		critical = last_hit.critical
		var has_red = false
		for group in pending.groups:
			has_red = has_red or group.color == 0
		if dealt > 0 and target.hp > 0 and has_red and passive.type == "burn":
			var previous: int = target.burn
			target.burn = mini(int(passive.cap), target.burn + 1)
			target.burnDamage = int(passive.value)
			target.burnExpires = round_number + 1
			burn_added = target.burn - previous
	last_strike = {"actor": actor, "damage": dealt, "shield": before_shield - target.shield, "burn": burn_added, "comboActive": combo_active, "manualCombo": pending.manualCombo, "critical": critical}
	pending.damage = unit.damage - turn_damage_before
	pending.special = special
	pending.strike = last_strike.duplicate(true)
	if unit.silenceTurns > 0:
		unit.silenceTurns -= 1
	var record = pending.duplicate(true)
	records.append(record)
	pending = {}
	stage = "committed"
	actions_this_round += 1
	if result == null:
		if actions_this_round == 2:
			var before_round = fighters.duplicate(true)
			_end_round()
			for side in range(2):
				var lost: int = before_round[side].hp - fighters[side].hp
				if lost > 0:
					last_round_effects.append({"actor": side, "damage": lost, "kind": "burn"})
		else:
			actor = 1 - actor
		if result == null:
			_start_turn()
	return record

func finish(path: Array, timed_out: bool = false) -> Dictionary:
	if resolve_puzzle(path, timed_out).is_empty():
		return {}
	return commit_turn()

func _end_round() -> void:
	for unit in fighters:
		if unit.burn > 0 and unit.hp > 0:
			unit.hp = maxi(1, unit.hp - floori(Stats.mitigate(unit.burn * unit.burnDamage, unit.stats, 0, false)))
		if unit.burnExpires <= round_number:
			unit.burn = 0
		if unit.barrierExpires > 0 and unit.barrierExpires <= round_number:
			unit.shield = 0
			unit.barrierExpires = 0
	if round_number == data.game_limits.rounds:
		var a: float = float(fighters[0].hp) / fighters[0].maxHp
		var b: float = float(fighters[1].hp) / fighters[1].maxHp
		result = "draw" if is_equal_approx(a, b) else ("player" if a > b else "ai")
		return
	round_number += 1
	actor = first
	actions_this_round = 0

func snapshot() -> Dictionary:
	return {"fighters": fighters.duplicate(true), "boards": boards.duplicate(true), "round": round_number, "actor": actor,
		"first": first, "actionsThisRound": actions_this_round, "turnSeconds": turn_seconds, "green": green, "boost": boost,
		"result": result, "special": special, "specialDamage": special_damage, "hpLoss": hp_loss, "stage": stage,
		"combatRng": combat_random.state,
		"pending": pending.duplicate(true), "intent": ai_intent.duplicate(true),
		"refills": [{"bag": refills[0].bag.duplicate(), "state": refills[0].random.state}, {"bag": refills[1].bag.duplicate(), "state": refills[1].random.state}]}
