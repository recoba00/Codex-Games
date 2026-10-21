extends SceneTree

const Board = preload("res://scripts/core/board.gd")
const Battle = preload("res://scripts/core/battle.gd")
const Catalog = preload("res://scripts/core/catalog.gd")
const Stats = preload("res://scripts/core/stats.gd")
const RandomStream = preload("res://scripts/core/random_stream.gd")
const LiveCatalog = preload("res://scripts/core/live_catalog.gd")
const RemoteBattle = preload("res://scripts/online/remote_battle.gd")
var checks = 0
var failures: Array = []
var turns = 0

func _initialize() -> void:
	var fixtures = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/web-reference.json"))
	for fixture in fixtures.board_cases:
		var dimensions = Vector2i(fixture.size.cols, fixture.size.rows)
		compare(Board.initial_counts(dimensions, int(fixture.seed), 4), fixture.counts, "historical four-color counts")
		var board = Board.create_board(dimensions, int(fixture.seed) ^ 0x18f61, int(fixture.seed), 4)
		compare(board, fixture.board, "unchanged historical board")
		compare(Board.find_groups(board, dimensions).size(), 0, "stable opening")
		compare(Board.has_move(board, dimensions), true, "opening solution")
	# Historical boards/refill remain compatible; v1 combat numbers intentionally do not.
	for fixture in fixtures.matches:
		var game = Battle.new(fixture.seed, Vector2i(fixture.size.cols, fixture.size.rows), fixture.player, fixture.opponent, fixture.spell, fixture.first, 4)
		for input in fixture.turns:
			if game.result != null:
				break
			var record = game.finish(input.path, input.timeout)
			compare(record.is_empty(), false, "historical path still legal")
			compare(game.boards, input.after.boards, "historical refill/order unchanged")
	_check_rules()
	_check_passives()
	_check_registration()
	_check_stats()
	_check_live_catalog()
	_check_remote_battle()
	for dimensions in [Vector2i(6, 5), Vector2i(6, 6), Vector2i(8, 6), Vector2i(6, 8)]:
		for seed_value in range(1, 13):
			var board = Board.create_board(dimensions, seed_value ^ 0x18f61, seed_value)
			compare(Board.find_groups(board, dimensions).is_empty(), true, "five-color stable")
			compare(Board.has_move(board, dimensions), true, "five-color playable")
			for color in range(5):
				compare(board.count(color), Board.initial_counts(dimensions, seed_value)[color], "five-color balanced")
			for first_side in range(2):
				var ids = ["ignis", "selene", "sylphi"]
				_replay(seed_value, dimensions, ids[seed_value % 3], ids[(seed_value + 1) % 3], first_side)
	var report = {"rules": "combat-v2", "checks": checks, "failures": failures, "historicalBoards": fixtures.board_cases.size(), "historicalRefillMatches": fixtures.matches.size(), "deterministicTurns": turns, "rendered": false}
	var file = FileAccess.open("res://artifacts/core-report.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t"))
	print(JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)

func _check_remote_battle() -> void:
	var catalog = Catalog.load_data()
	var state = {
		"version": 9,
		"youSeat": 1,
		"match": {
			"seed": 777, "catalog": catalog, "dimensions": {"cols": 6, "rows": 5},
			"fighters": [
				{"characterId": "ignis", "stats": catalog.characters.ignis.stats, "hp": 720, "maxHp": 1000, "mana": 12, "shield": 0, "burn": 0, "silenceTurns": 0},
				{"characterId": "selene", "stats": catalog.characters.selene.stats, "hp": 910, "maxHp": 1000, "mana": 100, "shield": 20, "burn": 1, "silenceTurns": 0}
			],
			"boards": [range(30), range(30, 60)], "round": 3, "first": 0, "actor": 1, "actionsThisRound": 1,
			"stage": "action", "turnDeadline": 123456789,
			"pending": {"groups": [{"color": 0, "cells": [0, 1, 2], "wave": 0}], "effects": [], "manualCombo": 1, "manaGain": 8, "manaDenied": 0, "healing": 0, "green": 0, "boost": 0},
			"result": null
		}
	}
	var remote = RemoteBattle.new(state)
	compare(remote.fighters[0].character, "selene", "remote local seat renders on the left")
	compare(remote.fighters[1].character, "ignis", "remote opponent renders on the right")
	compare(remote.actor, 0, "remote actor maps to local visual side")
	compare(remote.first, 1, "remote first seat maps to opponent visual side")
	compare(remote.boards[0][0], 30, "remote board follows local seat")
	compare(remote.can_use("active"), true, "remote active skill follows authoritative MP and stage")
	state.match.actor = 0
	state.match.stage = "puzzle"
	state.match.pending = null
	state.match.result = {"winnerSeat": 1, "finishReason": "completed"}
	remote.apply_state(state)
	compare(remote.actor, 1, "remote opponent actor maps to right side")
	compare(remote.result, "player", "remote winner maps to local result")
	compare(remote.can_use("active"), false, "remote finished match blocks skill")

func _check_live_catalog() -> void:
	var data = Catalog.load_data()
	var assets: Dictionary = {}
	var image_ids: Array = ["ignis", "selene", "sylphi"]
	for info in data.characters.values():
		for selected_skin in info.skins:
			var skin: Dictionary = info.skins[selected_skin]
			if not image_ids.has(skin.image):
				image_ids.append(skin.image)
			compare(Catalog.portrait(info, selected_skin) != null, true, "source artwork available without live media store")
	for id in image_ids:
		var hash_value = id.substr(6, 64) if id.begins_with("asset_") else "a".repeat(64)
		assets[id] = {"ext": "webp", "width": 512, "height": 768, "bytes": 1000, "sha256": hash_value, "path": "assets/" + id}
	var payload = {"format_version": 1, "schema_version": 3, "characters": data.characters.duplicate(true), "combat": data.combat.duplicate(true), "assets": assets, "revision": "b".repeat(64)}
	compare(LiveCatalog.validate(payload), true, "published catalog accepted")
	var applied = LiveCatalog.apply(data, payload)
	if applied.is_empty():
		return
	compare(applied.content_revision, payload.revision, "catalog revision applied")
	compare(data.has("content_revision"), false, "live application does not mutate bundled defaults")
	for skin in ["school_uniform", "swimsuit", "office"]:
		payload.characters.ignis.skins[skin] = {"name": skin, "image": "ignis", "enabled": true}
	compare(LiveCatalog.validate(payload), true, "cosmetic variations accepted")
	compare(Catalog.skin_id(payload.characters.ignis, "removed"), "base", "retired skin safely falls back to default")
	var skinned = LiveCatalog.apply(data, payload)
	compare(skinned.characters.ignis.stats, data.characters.ignis.stats, "skins have no stats")
	var baseline = Battle.new(1001, Vector2i(6, 5), "ignis", "selene", "smite", 0, 5, data)
	var alternate = Battle.new(1001, Vector2i(6, 5), "ignis", "selene", "smite", 0, 5, skinned)
	baseline.finish([])
	alternate.finish([])
	compare(alternate.snapshot(), baseline.snapshot(), "cosmetic catalog does not change combat or RNG")
	var bad = payload.duplicate(true)
	bad.characters.ignis.skins.school_uniform.stats = {"attack": 999}
	compare(LiveCatalog.validate(bad), false, "skin stat injection rejected")
	bad = payload.duplicate(true)
	bad.assets.ignis.path = "https://untrusted.invalid/image.png"
	compare(LiveCatalog.validate(bad), false, "arbitrary image URL rejected")
	bad = payload.duplicate(true)
	bad.characters.ignis.default_skin = "missing"
	compare(LiveCatalog.validate(bad), false, "missing default rejected")
	bad = payload.duplicate(true)
	bad.characters.ignis.skins.base.enabled = false
	compare(LiveCatalog.validate(bad), false, "unpublished skin rejected in public document")
	bad = payload.duplicate(true)
	bad.characters.ignis.stats.crit_chance = 2
	compare(LiveCatalog.validate(bad), false, "unsafe remote tuning rejected")
	bad = payload.duplicate(true)
	bad.characters.ignis.active.type = "script"
	compare(LiveCatalog.validate(bad), false, "remote code rejected")
	for invalid in [null, [], {"characters": []}, {"revision": 1}]:
		compare(LiveCatalog.apply(data, invalid) if invalid is Dictionary else {}, {}, "bad catalog never replaces current data")

func _check_rules() -> void:
	var game = Battle.new(1001, Vector2i(6, 5), "sylphi", "ignis")
	var original = game.snapshot()
	for path in [[0, 29], [-1], [0.5], [30]]:
		compare(game.resolve_puzzle(path), {}, "reject invalid route")
		compare(game.snapshot(), original, "invalid route pure")
	compare(game.commit_turn(), {}, "cannot commit before matching")
	game.fighters[0].mana = 100
	compare(game.use("active"), false, "skill only after match")
	compare(game.use("spell"), true, "spell before match")
	var record = game.resolve_puzzle([])
	compare(record.groups.size(), 0, "empty move needs no attack tile")
	compare(game.fighters[1].hp, 900, "matching has not hit")
	compare(game.actor, 0, "same actor during choice")
	var action_snapshot = game.snapshot()
	compare(game.resolve_puzzle([]), {}, "duplicate match denied")
	compare(game.snapshot(), action_snapshot, "duplicate match pure")
	compare(game.use("active"), true, "MP choice after matching")
	compare(game.use("active"), true, "repeat skill with MP")
	compare(game.fighters[0].mana, 20, "MP paid twice")
	compare(game.can_use("active"), false, "no free cast")
	record = game.commit_turn()
	compare(record.strike.damage, 70, "one baseline without red")
	compare(record.damage, 470, "spell plus repeated skill plus one strike")
	compare(game.records.size(), 1, "one record")
	compare(game.commit_turn(), {}, "double commit denied")
	compare(game.fighters[0].nextBoost, 0.2, "skill boost queued for next own turn")
	game = Battle.new()
	game.fighters[0].mana = 100
	game.fighters[0].silenceTurns = 1
	game.resolve_puzzle([])
	compare(game.can_use("active"), false, "silence covers entire action phase")
	game.commit_turn()
	compare(game.fighters[0].silenceTurns, 0, "silence consumed at final strike")
	game = Battle.new()
	game.fighters[0].mana = 100
	game.fighters[1].hp = 1
	game.resolve_puzzle([])
	compare(game.use("active"), true, "lethal skill accepted")
	compare(game.result, "player", "immediate KO")
	compare(game.use("active"), false, "dead target cannot be hit")
	compare(game.commit_turn().strike.damage, 0, "no post-KO ghost strike")
	compare(game.fighters[1].hp, 0, "KO persists")
	for initial_hp in [700, 980, 1000]:
		game = Battle.new()
		game.fighters[0].hp = initial_hp
		game.boards[0] = _groups(game, [4])
		record = game.resolve_puzzle([])
		compare(record.healing, sum_effects(game.last_effects, "healed"), "healing receipt")
		compare(record.healing <= 80 and game.fighters[0].hp <= 1000, true, "healing cap")
		compare(game.fighters[0].hp - initial_hp, record.healing, "exact recovery")
	game = Battle.new()
	game.fighters[0].hp = 0
	game.boards[0] = _groups(game, [4])
	compare(game.resolve_puzzle([]), {}, "dead actor cannot heal")
	compare(game.fighters[0].hp, 0, "no resurrection")
	game = Battle.new(1001, Vector2i(6, 5), "ignis", "selene", "reshape")
	original = game.snapshot()
	for cells in [[], [0, 0], [0, 30], [0.5], [0, 1, 2]]:
		compare(game.reshape(cells, 3), false, "reshape validation")
		compare(game.snapshot(), original, "bad reshape atomic")
	compare(game.reshape([0, 1], 3), true, "reshape two cells")
	compare([game.boards[0][0], game.boards[0][1]], [3, 3], "reshape data changed")
	compare(game.reshape([2], 0), false, "reshape once per match")
	compare(game.fighters[1].hp, 1000, "reshape does not hit")
	game = Battle.new()
	var intent = game.ai_intent.duplicate(true)
	game.fighters[1].mana = 100
	game.resolve_puzzle([])
	compare(game.ai_intent, intent, "intent not replanned after player input")
	game.commit_turn()
	compare(game.ai_intent, intent, "intent persists into AI action")
	game = Battle.new()
	game.resolve_puzzle([], true)
	compare(game.pending.assisted, true, "deadline still helps")
	compare(game.pending.manualCombo, 0, "assist earns no manual passive")

func _check_passives() -> void:
	var config = Catalog.load_data()
	config.characters.selene.passive_config.type = "none"
	var plain = Battle.new(1, Vector2i(6, 5), "ignis", "selene", "smite", 0, 5, config)
	compare(plain.finish([]).strike.damage, 70, "neutral baseline")
	var guarded = Battle.new()
	compare(guarded.finish([]).strike.damage, 64, "configured eight percent mitigation")
	var advantaged = Battle.new(1, Vector2i(6, 5), "ignis", "sylphi")
	compare(advantaged.finish([]).strike.damage, 73, "advantage five percent not twenty")
	var game = Battle.new(1, Vector2i(6, 5), "sylphi", "ignis")
	game.boards[0] = _groups(game, [0, 1, 3])
	var groups = Board.find_groups(game.boards[0], game.dimensions)
	game.resolve_puzzle([0, 1])
	compare(game.pending.manualCombo, groups.size(), "only first wave manual groups")
	compare(game.commit_turn().strike.comboActive, true, "Sylphi passive changes this strike")
	compare(game.turn_seconds, 15, "Sylphi no time bonus")
	game = Battle.new(1, Vector2i(6, 5), "sylphi", "ignis")
	game.boards[0] = _groups(game, [0, 1, 3])
	game.resolve_puzzle([])
	compare(game.commit_turn().strike.comboActive, false, "free preformed/falling groups do not trigger passive")
	game = Battle.new()
	game.boards[0] = _groups(game, [0])
	game.finish([])
	compare(game.fighters[1].burn, 1, "Ignis applies one stack per final strike")
	compare(game.fighters[1].burnDamage, 8, "configured burn damage")

func _check_registration() -> void:
	var config = Catalog.load_data()
	config.characters.custom = config.characters.sylphi.duplicate(true)
	config.characters.custom.stats.max_hp = 1200
	config.characters.custom.stats.attack = 150
	config.characters.custom.active.cost = 25
	config.characters.custom.active.damage = 200
	config.characters.custom.active.type = "damage"
	var game = Battle.new(1, Vector2i(6, 5), "custom", "ignis", "smite", 0, 5, config)
	config.characters.custom.stats.max_hp = 1
	compare(game.fighters[0].maxHp, 1200, "registered character HP and isolated config")
	game.fighters[0].mana = 100
	game.resolve_puzzle([])
	compare(game.use("active"), true, "custom character uses template")
	compare(game.fighters[0].mana, 75, "custom MP cost")
	compare(game.fighters[1].hp, 700, "custom attack scales skill")
	game.use("active")
	var record = game.commit_turn()
	compare(record.damage, 500, "skill plus strike obey shared turn damage cap")

func _check_stats() -> void:
	var base = Stats.defaults()
	compare(base, {"max_hp": 1000, "attack": 100, "defense": 0, "crit_chance": 0, "crit_damage": 1.5, "damage_reduction": 0}, "neutral stat defaults")
	var legacy = Stats.from_character({"hp": 1234, "attack": 150})
	compare(legacy.max_hp, 1234, "legacy health migrated")
	compare(legacy.attack, 150, "legacy attack migrated")
	compare(legacy.crit_chance, 0, "legacy new stats get safe defaults")
	compare(Stats.from_character({}), base, "missing base fields inherit the shared registry")
	compare(Stats.from_character({"hp": 1900, "stats": {"max_hp": 1234}}).max_hp, 1234, "canonical stats take priority over legacy aliases")
	var modifiers = [{"stat": "max_hp", "flat": 200}, {"stat": "max_hp", "percent": 0.2}, {"stat": "attack", "flat": 20, "percent": 0.1}]
	var final = Stats.resolve(base, modifiers)
	compare(final.max_hp, 1440, "flat then percent extension hook")
	compare(final.attack, 132, "attack modifiers compose")
	modifiers.reverse()
	compare(Stats.resolve(base, modifiers), final, "modifier order independent")
	compare(base.max_hp, 1000, "base values not mutated")
	compare(Stats.resolve(base, [{"stat": "attack", "percent": 0.15}]).attack, 115, "integer modifiers tolerate floating point drift")
	var clamped = Stats.resolve({"defense": -1, "crit_chance": 5, "crit_damage": -1, "damage_reduction": 10})
	compare([clamped.defense, clamped.crit_chance, clamped.crit_damage, clamped.damage_reduction], [0, 1, 1, 0.8], "final values bounded")
	var config = Catalog.load_data()
	config.characters.sylphi.stats.crit_chance = 1
	config.characters.sylphi.stats.crit_damage = 2
	var game = Battle.new(1001, Vector2i(6, 5), "sylphi", "ignis", "smite", 0, 5, config)
	var before_rng: int = game.combat_random.state
	for _index in range(12):
		compare(game.preview_damage_range([]), {"min": 140, "max": 140}, "certain critical preview")
	compare(game.combat_random.state, before_rng, "preview never rolls RNG")
	var record = game.finish([])
	compare([record.strike.damage, record.strike.critical], [140, true], "certain critical uses total multiplier")
	game = Battle.new(1001, Vector2i(6, 5), "sylphi", "ignis", "smite", 0, 5, config)
	game.fighters[0].mana = 100
	compare(game.use("spell"), true, "fixed spell allowed")
	compare(game.last_special_hit.critical, false, "fixed spell cannot crit")
	compare(game.combat_random.state, before_rng, "fixed spell consumes no critical roll")
	game.resolve_puzzle([])
	game.use("active")
	compare([game.last_special_hit.critical, game.special_damage], [true, 400], "active can crit and fixed spell stays fixed")
	config.characters.sylphi.stats.crit_chance = 0.35
	var critical_count = 0
	for index in range(1, 25):
		var seed_value = index * 0x9e3779b1
		game = Battle.new(seed_value, Vector2i(6, 5), "sylphi", "ignis", "smite", 0, 5, config)
		var twin = Battle.new(seed_value, Vector2i(6, 5), "sylphi", "ignis", "smite", 0, 5, config)
		var expected_roll = RandomStream.new(seed_value ^ 0x4cf1d).next() < 0.35
		before_rng = game.combat_random.state
		compare(game.preview_damage_range([]), {"min": 70, "max": 140}, "uncertain preview is a range")
		compare(game.combat_random.state, before_rng, "range queries are pure")
		record = game.finish([])
		compare(record, twin.finish([]), "critical replay deterministic")
		compare(record.strike.critical, expected_roll, "seeded critical probability")
		compare(game.refills[0].random.state, twin.refills[0].random.state, "combat RNG separate from refill")
		critical_count += 1 if expected_roll else 0
	compare(critical_count > 0 and critical_count < 24, true, "both outcomes covered, not a balance estimate")
	var neutral = Battle.new()
	before_rng = neutral.combat_random.state
	compare(neutral.finish([]).strike.critical, false, "zero critical chance stays noncritical")
	compare(neutral.combat_random.state, before_rng, "zero chance consumes no roll")
	var ai_config = Catalog.load_data()
	ai_config.characters.ignis.stats.crit_chance = 1
	ai_config.characters.ignis.stats.crit_damage = 2
	var ai_game = Battle.new(1001, Vector2i(6, 5), "sylphi", "ignis", "smite", 1, 5, ai_config)
	var ai_record = ai_game.finish([])
	compare([ai_record.actor, ai_record.strike.damage, ai_record.strike.critical], [1, 147, true], "AI uses the same critical rules")
	config = Catalog.load_data()
	config.characters.ignis.stats.defense = 100
	config.characters.ignis.stats.damage_reduction = 0.25
	game = Battle.new(1001, Vector2i(6, 5), "sylphi", "ignis", "smite", 0, 5, config)
	compare(game.preview_damage_range([]), {"min": 26, "max": 26}, "defense then all damage reduction")
	compare(game.finish([]).strike.damage, 26, "preview equals actual mitigation")
	game.fighters[1].burn = 2
	game.fighters[1].burnDamage = 8
	game.fighters[1].burnExpires = 10
	var before_hp: int = game.fighters[1].hp
	game.finish([])
	compare(before_hp - game.fighters[1].hp, 12, "all damage reduction includes burn, defense does not")
	compare(sum_effects(game.last_round_effects, "damage"), 12, "burn receipt uses actual mitigation")
	config.characters.ignis.passive_config.type = "guard"
	config.characters.ignis.passive_config.value = 0.4
	game = Battle.new(1001, Vector2i(6, 5), "sylphi", "ignis", "smite", 0, 5, config)
	compare(game.finish([]).strike.damage, 15, "guard stacks multiplicatively not additively")
	game = Battle.new(1001, Vector2i(6, 5), "sylphi", "ignis", "smite", 0, 5, config)
	game.fighters[1].shield = 10
	var preview: int = game.preview_damage([])
	record = game.finish([])
	compare([record.strike.damage, record.strike.shield], [preview, 10], "mitigation before shield and HP cap")

func _replay(seed_value: int, dimensions: Vector2i, player: String, enemy: String, first_side: int) -> void:
	var game = Battle.new(seed_value, dimensions, player, enemy, "barrier", first_side)
	var twin = Battle.new(seed_value, dimensions, player, enemy, "barrier", first_side)
	while game.result == null and game.records.size() < 16:
		var actor: int = game.actor
		var before_hp: int = game.fighters[0].hp + game.fighters[1].hp
		var path = Board.simple_match(game.boards[actor], dimensions, seed_value + game.records.size())
		game.resolve_puzzle(path)
		twin.resolve_puzzle(path)
		compare(game.fighters[1 - actor].hp, twin.fighters[1 - actor].hp, "deterministic match phase")
		var used = 0
		if game.can_use("active"):
			var before: int = game.fighters[actor].damage
			game.use("active")
			twin.use("active")
			used = game.fighters[actor].damage - before
		var record = game.commit_turn()
		compare(record, twin.commit_turn(), "deterministic record")
		compare(game.snapshot(), twin.snapshot(), "deterministic state")
		compare(record.damage, record.strike.damage + used, "one final strike plus chosen skill")
		compare(sum_effects(game.last_effects, "mana"), record.manaGain, "MP conservation")
		compare(before_hp - game.fighters[0].hp - game.fighters[1].hp, record.damage + sum_effects(game.last_round_effects, "damage") - record.healing, "HP conservation")
		compare(record.damage <= 500, true, "per turn direct cap")
		compare(record.manualCombo <= record.groups.size(), true, "manual groups bounded")
		for unit in game.fighters:
			compare(unit.mana >= 0 and unit.mana <= 100 and unit.hp >= 0 and unit.hp <= unit.maxHp, true, "resource bounds")
		turns += 1
	compare(game.result != null, true, "bounded full duel")

func _groups(game: RefCounted, colors: Array) -> Array:
	var board = Board.create_board(game.dimensions, 727, 311)
	for row in range(colors.size()):
		for col in range(3):
			board[row * game.dimensions.x + col] = colors[row]
	return board

func sum_effects(effects: Array, key: String) -> float:
	var total = 0.0
	for effect in effects:
		total += effect.get(key, 0)
	return total

func compare(actual: Variant, expected: Variant, location: String) -> void:
	checks += 1
	if not equivalent(actual, expected) and failures.size() < 20:
		failures.append(location + ": " + str(actual).left(200) + " != " + str(expected).left(200))

func equivalent(a: Variant, b: Variant) -> bool:
	if (a is int or a is float) and (b is int or b is float):
		return absf(float(a) - float(b)) < 0.00000001
	if a is Array and b is Array:
		if a.size() != b.size():
			return false
		for index in range(a.size()):
			if not equivalent(a[index], b[index]):
				return false
		return true
	if a is Dictionary and b is Dictionary:
		if a.size() != b.size():
			return false
		for key in a:
			if not b.has(key) or not equivalent(a[key], b[key]):
				return false
		return true
	return a == b
