extends SceneTree

const Main = preload("res://scenes/main.tscn")
const Board = preload("res://scripts/core/board.gd")
var app: Control
var report = {"passed": false, "engineInput": true, "physicalDevice": false, "checks": []}

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	app = Main.instantiate()
	root.add_child(app)
	await frames()
	app.character = "sylphi"
	app.spell = "reshape"
	app.start_match()
	app.set_process(false)
	app._smoke_settle()
	app.window_active = true
	app._refresh()
	await frames()
	await click(app.spell_button)
	assert(app.reshape_popup.visible)
	var swatches: HBoxContainer = app.reshape_popup.get_children().filter(func(child): return child is HBoxContainer)[0]
	await click(swatches.get_child(4))
	assert(app.reshape_color == 4 and app.puzzle.targeting)
	await tap(app.puzzle.global_position + app.puzzle.cell_center(0))
	assert(app.reshape_cells == [0] and not app.game.fighters[0].spellUsed)
	await tap(app.puzzle.global_position + app.puzzle.cell_center(1))
	assert(app.game.boards[0][0] == 4 and app.game.boards[0][1] == 4)
	assert(app.game.fighters[0].spellUsed and not app.puzzle.targeting and app.reshape_cells.is_empty())
	assert(app.game.stage == "puzzle" and app.game.fighters[1].hp == 1000)
	await shot("combat-reshape")
	report.checks.append("real spell/color/cell taps apply two-cell reshape once without damage")
	app.game.fighters[0].mana = 100
	var target_hp: int = app.game.fighters[1].hp
	app.finish_turn(Board.simple_match(app.game.boards[0], app.game.dimensions))
	while app.presentation.busy:
		app.presentation.advance(10)
	assert(app.phase == "player_action" and app.game.actor == 0 and app.game.fighters[1].hp == target_hp)
	assert(app.puzzle.visual_mode.is_empty() and app.puzzle.values == app.game.boards[0], "Action choice must show fully settled tiles")
	assert(not app.active_button.disabled and not app.end_button.disabled and not app.puzzle.interactive)
	app.action_seconds = 2.4
	await click(app.active_button)
	while app.presentation.busy:
		app.presentation.advance(10)
	assert(app.game.fighters[0].mana == 60 and app.game.fighters[0].activeUses == 1)
	assert(app.phase == "player_action" and is_equal_approx(app.action_seconds, 2.4))
	app.paused = true
	app._process(0.1)
	assert(is_equal_approx(app.action_seconds, 2.4))
	app.paused = false
	app.host_visible = false
	app._process(0.1)
	assert(is_equal_approx(app.action_seconds, 2.4))
	app.host_visible = true
	app._refresh()
	await frames()
	await shot("combat-action")
	await click(app.end_button)
	assert(app.game.records.size() == 1 and app.game.fighters[0].mana == 60)
	app._smoke_settle()
	report.checks.append("match then skill, bounded frozen action budget, real confirm retains MP")
	app.show_preparation()
	app.spell = "barrier"
	app.start_match()
	app._smoke_settle()
	await frames()
	app.game.fighters[0].mana = 40
	app.finish_turn([])
	while app.presentation.busy:
		app.presentation.advance(10)
	assert(app.phase == "player_action")
	app.action_seconds = 0.05
	app._process(0.1)
	assert(app.game.records.size() == 1 and app.game.fighters[0].activeUses == 0)
	app._confirm_turn()
	assert(app.game.records.size() == 1)
	report.checks.append("action deadline commits once without auto-casting")
	app.show_preparation()
	var registered: Dictionary = app.data.characters.selene.duplicate(true)
	registered.name = "긴이름테스트캐릭터"
	registered.role = "수호와콤보의테스트역할"
	registered.portrait = "sylphi"
	registered.stats.max_hp = 1234
	registered.stats.crit_chance = 0.5
	registered.stats.crit_damage = 2
	app.data.characters.custom = registered
	app.character_ids.append("custom")
	var previous = app.preparation
	previous.get_parent().remove_child(previous)
	previous.free()
	app.card_buttons.clear()
	app._build_preparation()
	await frames()
	await click(app.card_buttons.custom)
	assert(app.character == "custom")
	assert(app.card_buttons.custom.get_global_rect().end.x <= root.get_visible_rect().size.x - 16)
	assert(app.card_buttons.custom.get_global_rect().end.y <= app.preparation.get_global_rect().end.y)
	await shot("combat-registered-character")
	app.start_match()
	assert(app.game.fighters[0].character == "custom" and app.game.fighters[0].maxHp == 1234)
	assert(app.meters[0].portrait.texture == app.Catalog.portrait(registered))
	report.checks.append("registered ID uses selected existing art, stats and templates; four-card grid wraps")
	app._smoke_settle()
	app._preview_route(app.game.boards[0], 0)
	assert(app.preview.text.contains("~") and app.preview.text.contains("치명타 포함"))
	app.show_preparation()
	app.data.characters.custom.stats.crit_chance = 1
	app.start_match()
	app._smoke_settle()
	app.finish_turn([])
	app._smoke_settle()
	assert(app.game.records[0].strike.critical)
	# Capture another certain critical without skipping its actual impact frame.
	app.show_preparation()
	app.start_match()
	app._smoke_settle()
	app.finish_turn([])
	while app.presentation.busy:
		app.presentation.advance(10)
	app._confirm_turn()
	app.presentation.advance(0.23)
	assert(app.presentation.current.title.contains("치명타"))
	await shot("combat-critical")
	report.checks.append("uncertain critical preview is a range; actual critical impact is labeled")
	report.passed = true
	var file = FileAccess.open("res://artifacts/combat-ui-report.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t"))
	print("GODOT_COMBAT_UI_OK " + JSON.stringify(report))
	app.audio.set_suspended(true)
	app.queue_free()
	await process_frame
	quit()

func frames() -> void:
	for _index in range(3):
		await RenderingServer.frame_post_draw

func click(control: Control) -> void:
	var point = control.get_global_rect().get_center()
	if control.get_window() != root:
		point += Vector2(control.get_window().position)
	await tap(point)

func tap(point: Vector2) -> void:
	var event = InputEventMouseButton.new()
	event.position = point
	event.global_position = point
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	root.push_input(event, true)
	await process_frame
	event = event.duplicate()
	event.pressed = false
	root.push_input(event, true)
	await process_frame

func shot(name_value: String) -> void:
	await RenderingServer.frame_post_draw
	assert(root.get_texture().get_image().save_png("res://artifacts/" + name_value + ".png") == OK)
