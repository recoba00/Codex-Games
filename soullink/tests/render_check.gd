extends SceneTree

const Main = preload("res://scenes/main.tscn")
const Board = preload("res://scripts/core/board.gd")
var app: Control
var report: Dictionary = {"renderer": "", "screens": [], "engineInput": [], "errors": [], "physicalDevice": false}

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	app = Main.instantiate()
	root.add_child(app)
	await frames()
	report.renderer = RenderingServer.get_current_rendering_method()
	check_frame("prepare")
	await shot("native-prepare")
	await click(app.card_buttons.sylphi)
	assert(app.character == "sylphi")
	await click(app.card_buttons.ignis)
	assert(app.character == "ignis")
	await click(app.preparation.get_node("Start"))
	assert(app.in_battle and app.arena.visible)
	await wait_input()
	report.engineInput.append({"characterButtons": ["sylphi", "ignis"], "startButton": true})
	app.paused = true
	app._refresh()
	await frames()
	check_frame("battle")
	await shot("native-battle")
	var held_seconds: float = app.seconds
	await create_timer(0.15).timeout
	assert(app.seconds == held_seconds)
	app.paused = false
	app.window_active = true
	app._refresh()
	var press = InputEventMouseButton.new()
	press.position = app.puzzle.global_position + app.puzzle.cell_center(11)
	press.global_position = press.position
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	root.push_input(press, true)
	await process_frame
	assert(app.puzzle.dragging)
	for cell in [10, 9]:
		await create_timer(0.14).timeout
		var movement = InputEventMouseMotion.new()
		movement.position = app.puzzle.global_position + app.puzzle.cell_center(cell)
		movement.global_position = movement.position
		movement.button_mask = MOUSE_BUTTON_MASK_LEFT
		root.push_input(movement, true)
	var release = InputEventMouseButton.new()
	release.position = app.puzzle.global_position + app.puzzle.cell_center(9)
	release.global_position = release.position
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	root.push_input(release, true)
	await process_frame
	assert(app.game.records.is_empty() and app.game.pending.path == [11, 10, 9] and app.game.stage == "action")
	report.engineInput.append({"drag": [11, 10, 9], "pending": true, "doubleRelease": false})
	root.push_input(release, true)
	await process_frame
	assert(app.game.records.is_empty() and app.game.pending.path == [11, 10, 9])
	await wait_input()
	assert(app.game.round_number == 2 and app.game.actor == 0 and app.game.records.size() == 2)
	report.engineInput.append({"ai": "actual process delay + single swap", "round": 2})
	app.seconds = 0.001
	await process_frame
	await process_frame
	assert(app.game.records.size() == 2 and app.game.pending.assisted)
	report.engineInput.append({"timeout": "accelerated deadline", "assisted": true})
	app.paused = true
	app._refresh()
	app._show_help()
	await frames()
	assert(app.help_popup.visible and app.help_popup.size.x <= root.size.x)
	await shot("native-help")
	app.help_popup.hide()
	await frames()
	app.paused = false
	app._smoke_settle()
	while app.game.result == null:
		app.finish_turn(Board.simple_match(app.game.boards[app.game.actor], app.game.dimensions))
		app._smoke_settle()
	await frames()
	assert(app.result_popup.visible)
	assert(app.result_popup.size.y > root.size.y * 0.7)
	assert(app.result_art.texture != null and app.result_art.size.y > 200)
	await shot("native-result")
	var previous_seed: int = app.match_seed
	await click(app.result_rematch)
	app._smoke_settle()
	assert(app.in_battle and not app.result_popup.visible and app.match_seed == previous_seed + 1)
	while app.game.result == null:
		app.finish_turn(Board.simple_match(app.game.boards[app.game.actor], app.game.dimensions))
		app._smoke_settle()
	await frames()
	await click(app.result_change)
	assert(app.preparation.visible and not app.result_popup.visible)
	app.show_preparation()
	for board_index in range(app.data.board_sizes.size()):
		app.board_index = board_index
		app.start_match()
		app.paused = true
		app._refresh()
		await frames()
		assert(app.puzzle.tile_size() > 30)
		check_frame("board-%d" % board_index)
		app.show_preparation()
	app.board_index = 0
	for dimensions in [Vector2i(360, 640), Vector2i(430, 932), Vector2i(844, 390)]:
		root.size = dimensions
		await frames()
		check_frame("prepare-%dx%d" % [dimensions.x, dimensions.y])
		app.start_match()
		app.paused = true
		app._refresh()
		await frames()
		assert(app.timer_label.text == "15.0")
		check_frame("battle-%dx%d" % [dimensions.x, dimensions.y])
		await shot("native-%dx%d" % [dimensions.x, dimensions.y])
		app.show_preparation()
	var file = FileAccess.open("res://artifacts/render-report.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t"))
	print("GODOT_RENDER_OK " + JSON.stringify(report))
	app.audio.set_suspended(true)
	app.queue_free()
	app = null
	await create_timer(0.1).timeout
	quit()

func frames() -> void:
	for _index in range(4):
		await RenderingServer.frame_post_draw

func wait_input() -> void:
	for _index in range(1200):
		if app.phase == "player_input" and not app.presentation.busy:
			return
		if app.phase == "player_action" and not app.presentation.busy:
			await click(app.end_button)
		await process_frame
	assert(false, "Presentation did not return player input")

func click(button: Control) -> void:
	var event = InputEventMouseButton.new()
	event.position = button.get_global_rect().get_center()
	event.global_position = event.position
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
	var error = root.get_texture().get_image().save_png("res://artifacts/" + name_value + ".png")
	assert(error == OK)

func check_frame(context: String) -> void:
	var header: Control = app.get_node("SafeArea/Layout/Header")
	var body: MarginContainer = app.get_node("SafeArea/Layout/Body")
	assert(is_equal_approx(header.size.y, 56))
	for side in ["left", "top", "right", "bottom"]:
		assert(body.get_theme_constant("margin_" + side) == 16)
	for side in ["left", "right"]:
		assert(header.get_theme_constant("margin_" + side) == 16)
	var page: Control = app.arena if app.in_battle else app.preparation
	assert(page.position == Vector2.ZERO and page.size.x <= body.size.x and page.size.y <= body.size.y)
	if app.in_battle:
		assert(app.puzzle.size.y > 80 and app.puzzle.size.x > 100)
		assert(app.end_button.size.x >= 44 and app.end_button.size.y >= 44)
	else:
		var start: Control = app.preparation.get_node("Start")
		assert(start.position.y + start.size.y <= page.size.y + 1)
	report.screens.append({"context": context, "viewport": var_to_str(root.get_visible_rect().size), "header": header.size.y, "pagePadding": 16, "battle": app.in_battle})
