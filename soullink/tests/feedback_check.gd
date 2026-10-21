extends SceneTree

const Main = preload("res://scenes/main.tscn")
const Board = preload("res://scripts/core/board.gd")
var app: Control
var report = {"passed": false, "checks": [], "screenshots": [], "physicalDevice": false}

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	app = Main.instantiate()
	root.add_child(app)
	await frames()
	app.start_match()
	app.set_process(false)
	app.presentation.advance(0.16)
	await frames()
	assert(app.presentation.banner.visible and app.presentation.title.text == "나의 턴")
	assert(not app.puzzle.interactive and app.seconds == 15)
	assert(app.presentation.banner.get_global_rect().end.x <= root.size.x)
	assert(app.presentation.kicker.text.contains("PLAYER"))
	assert(app.presentation.FX.ATLAS.get_width() == 1254 and app.presentation.light.material.blend_mode == CanvasItemMaterial.BLEND_MODE_ADD)
	assert(app.presentation._strike(0.15) < 0 and app.presentation._strike(0.37) > app.presentation._strike(0.2))
	assert(app.presentation._strike(0.4) == app.presentation._strike(0.5), "Card must hold briefly at the impact instead of drifting through it")
	await shot("feedback-turn")
	report.checks.append("center turn banner locks input without consuming time")
	report.checks.append("tactical white/charcoal HUD and generated transparent additive atlas loaded")
	app.window_active = true
	app.set_process(true)
	await wait_for(func(): return app.phase == "player_input")
	var path = red_path()
	for seed_value in range(2, 50):
		if not path.is_empty():
			break
		app.game.boards[0] = Board.create_board(app.game.dimensions, seed_value ^ 0x18f61, seed_value)
		path = red_path()
	assert(not path.is_empty())
	app.game.fighters[1].shield = 60
	app.game.fighters[1].barrierExpires = 3
	app._refresh()
	app.finish_turn(path)
	assert(app.game.records.is_empty() and app.game.stage == "action" and not app.puzzle.interactive)
	await wait_for(func(): return app.presentation.current.get("kind") == "match" and app.presentation.elapsed > 0.15)
	app.set_process(false)
	await frames()
	assert(app.preview.text.contains("타격 +") and app.game.fighters[1].hp == 1000)
	assert(app.preview.get_minimum_size().x <= app.preview.size.x)
	await shot("feedback-match")
	assert(await light_pixels() > 100, "Match light sprites must visibly change the rendered board")
	assert(app.presentation.current.duration <= 0.4)
	report.checks.append("red match queues strike bonus without premature HP damage")
	app.set_process(true)
	await wait_for(func(): return app.presentation.current.get("kind") == "drop")
	app.set_process(false)
	await frames()
	assert(app.puzzle.visual_mode == "fall")
	await shot("feedback-fall")
	var rect: Rect2 = app.puzzle.get_global_rect()
	var strip = Rect2i(Vector2i(rect.position), Vector2i(int(rect.size.x), floori(app.puzzle.board_origin().y)))
	var above_grid = root.get_texture().get_image().get_region(strip).get_data()
	app.puzzle.visual_progress = 0.42
	app.puzzle.queue_redraw()
	await frames()
	assert(above_grid == root.get_texture().get_image().get_region(strip).get_data(), "Falling tiles must be clipped below the combo/HUD lane")
	report.checks.append("falling tiles cannot intrude into the combo/HUD lane")
	app.set_process(true)
	await wait_for(func(): return app.presentation.current.get("kind") == "impact" and app.presentation.elapsed > 0.19)
	app.set_process(false)
	await frames()
	assert(app.meters[0].portrait.modulate.a == 0 and app.meters[1].portrait.modulate.a == 0)
	assert(app.presentation.number.visible)
	await shot("feedback-hit")
	assert(await light_pixels() > 100, "Impact must render a textured flash, slash and sparks")
	assert(app.presentation.current.duration <= 0.44)
	assert(app.presentation.hero_source.size.y > app.meters[0].portrait.size.y * 1.5)
	report.checks.append("attacker lunges; victim shakes/flashes; actual damage floats at impact")
	app.set_process(true)
	app.host_visible = false
	var held: float = app.presentation.elapsed
	await create_timer(0.2).timeout
	assert(app.presentation.elapsed == held)
	app.host_visible = true
	await wait_for(func(): return app.phase == "ai_move" and app.presentation.elapsed > 0.1)
	app.set_process(false)
	await frames()
	assert(app.ai_path.size() == 2 and Board.adjacent(app.ai_path[0], app.ai_path[1], app.game.dimensions))
	assert(app.puzzle.visual_mode == "ai" and app.presentation.ai_label.visible and not app.puzzle.interactive)
	await shot("feedback-ai")
	report.checks.append("visible AI cursor/single swap; no player input during AI")
	app.set_process(true)
	await wait_for(func(): return app.phase == "player_input" and app.game.records.size() == 2)
	assert(app.seconds > 14.7)
	app.spell = "barrier"
	app.start_match()
	app._smoke_settle()
	app._use_special("spell")
	await wait_for(func(): return app.presentation.elapsed > 0.22)
	app.set_process(false)
	await frames()
	assert(app.game.fighters[0].shield == 150 and app.preview.text.contains("보호막 +150"))
	await shot("feedback-barrier")
	app.show_preparation()
	app.set_process(true)
	await create_timer(0.7).timeout
	assert(app.phase == "idle" and not app.in_battle and not app.presentation.busy)
	assert(app.meters[0].portrait.modulate.a == 1 and app.meters[1].portrait.modulate.a == 1)
	assert(not app.result_popup.visible)
	app.start_match()
	app._smoke_settle()
	var board = Board.create_board(app.game.dimensions, 727, 311)
	for color in range(5):
		for col in range(3):
			board[color * app.game.dimensions.x + col] = color
	app.game.boards[0] = board
	app.game.fighters[1].mana = 40
	app.game.fighters[1].shield = 60
	app.game.fighters[1].barrierExpires = 3
	app.game.fighters[0].hp = 650
	app.finish_turn([])
	await wait_for(func(): return app.presentation.current.get("kind") == "match" and app.presentation.elapsed > 0.15)
	app.set_process(false)
	await frames()
	var colors = {}
	for effect in app.presentation.current.effects:
		colors[effect.color] = true
	assert(colors.size() == 1, "Present one matched element/cause at a time")
	assert(app.preview.get_minimum_size().x <= app.preview.size.x, "Single cause/effect receipt must not overflow")
	assert(app.presentation.match_symbol.texture == app.puzzle.TILES[0])
	await shot("feedback-five-elements")
	app.set_process(true)
	await wait_for(func(): return app.presentation.current.get("kind") == "restore" and app.presentation.current.get("color") == 3 and app.presentation.elapsed > 0.24)
	app.set_process(false)
	await frames()
	assert(app.presentation.hero_restore.visible and app.presentation.hero_restore.size.y > app.meters[0].portrait.size.y * 1.5)
	assert(app.preview.text.contains("마나") and app.presentation.number.text.contains("MP"))
	assert(app.puzzle.values.count(-1) >= 9, "Earlier matched groups stay removed while subsequent receipts play")
	await shot("feedback-mana-portrait")
	app.set_process(true)
	await wait_for(func(): return app.presentation.current.get("kind") == "restore" and app.presentation.current.get("color") == 4 and app.presentation.elapsed > 0.24)
	app.set_process(false)
	await frames()
	assert(app.presentation.number.text.contains("HP +") and app.preview.text.contains("황금 치유"))
	assert(app.presentation.hero_restore.material.shader == app.Portrait.ROUNDED)
	await shot("feedback-heal-portrait")
	assert(await light_pixels() > 100)
	report.checks.append("five artwork tiles; per-match icon/cause/exact effect; enlarged rounded MP/HP portrait cut-ins")
	app.show_preparation()
	report.checks.append("background freezes visuals; canceled match restores cards and cannot fire stale callbacks")
	report.passed = true
	var file = FileAccess.open("res://artifacts/feedback-report.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t"))
	print("GODOT_FEEDBACK_OK " + JSON.stringify(report))
	quit()

func red_path() -> Array:
	for cell in range(app.game.boards[0].size()):
		for other in Board.neighbors(cell, app.game.dimensions):
			for group in Board.find_groups(Board.moved(app.game.boards[0], cell, other), app.game.dimensions):
				if group.color == 0:
					return [cell, other]
	return []

func wait_for(condition: Callable) -> void:
	for _index in range(1200):
		if condition.call():
			return
		if app.phase == "player_action" and not app.presentation.busy:
			app._confirm_turn()
		await process_frame
	assert(false, "Feedback state timed out")

func frames() -> void:
	for _index in range(3):
		await RenderingServer.frame_post_draw

func shot(name_value: String) -> void:
	assert(root.get_texture().get_image().save_png("res://artifacts/" + name_value + ".png") == OK)
	report.screenshots.append(name_value)

func light_pixels() -> int:
	var lit = root.get_texture().get_image()
	app.presentation.light.hide()
	app.puzzle.light.hide()
	await frames()
	var unlit = root.get_texture().get_image()
	app.presentation.light.show()
	app.puzzle.light.show()
	await frames()
	var count = 0
	for y in range(56, lit.get_height(), 3):
		for x in range(0, lit.get_width(), 3):
			var a = lit.get_pixel(x, y)
			var b = unlit.get_pixel(x, y)
			if a.r - b.r + a.g - b.g + a.b - b.b > 0.22:
				count += 1
	return count
