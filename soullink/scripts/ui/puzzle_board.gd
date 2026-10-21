extends Control

signal route_started
signal route_changed(values: Array, steps: int)
signal route_finished(route: Array)
signal cell_targeted(cell: int)

const Board = preload("res://scripts/core/board.gd")
const FX = preload("res://scripts/ui/combat_vfx.gd")
const LightLayer = preload("res://scripts/ui/vfx_layer.gd")
const COLORS = FX.COLORS
const ICONS = [preload("res://assets/icons/swords.svg"), preload("res://assets/icons/zap.svg"), preload("res://assets/icons/wind.svg"), preload("res://assets/icons/sparkles.svg"), preload("res://assets/icons/heart.svg")]
const TILES = [preload("res://assets/puzzles/attack.webp"), preload("res://assets/puzzles/denial.webp"), preload("res://assets/puzzles/boost.webp"), preload("res://assets/puzzles/mana.webp"), preload("res://assets/puzzles/heal.webp")]
const SHORT_NAMES = ["공격", "MP↓", "강화", "MP↑", "HP↑"]
const FONT = preload("res://assets/fonts/Pretendard-Regular.otf")
var values: Array = []
var dimensions = Vector2i(6, 5)
var route: Array = []
var interactive = false
var dragging = false
var pending_release = false
var last_step = 0
var max_steps = 116
var skins: Array[StyleBoxFlat] = []
var visual_mode = ""
var visual_progress = 0.0
var visual_data: Dictionary = {}
var fall_rows: Array = []
var light: Control
var targeting = false
var targeted_cells: Array = []

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	resized.connect(queue_redraw)
	for color in COLORS:
		var skin = StyleBoxFlat.new()
		skin.bg_color = Color("14171dea").lerp(Color(color, 0.94), 0.14)
		skin.border_color = Color(color, 0.65)
		skin.set_border_width_all(1)
		skin.set_corner_radius_all(2)
		skins.append(skin)
	light = LightLayer.new()
	light.source = self
	add_child(light)

func _process(_delta: float) -> void:
	if visual_mode != "":
		light.queue_redraw()

func present(board: Array, size_value: Vector2i, enabled: bool, step_limit: int) -> void:
	values = board.duplicate()
	dimensions = size_value
	max_steps = step_limit
	route.clear()
	dragging = false
	pending_release = false
	interactive = enabled
	visual_mode = ""
	visual_progress = 0.0
	visual_data = {}
	queue_redraw()
	light.queue_redraw()

func play_effect(kind: String, details: Dictionary) -> void:
	visual_mode = kind
	visual_progress = 0
	visual_data = details
	fall_rows.clear()
	if kind == "fall":
		var removed = {}
		for group in details.groups:
			for cell in group.cells:
				removed[cell] = true
		fall_rows.resize(values.size())
		for col in range(dimensions.x):
			var survivors: Array = []
			for row in range(dimensions.y - 1, -1, -1):
				if not removed.has(row * dimensions.x + col):
					survivors.append(row)
			for index in range(dimensions.y):
				var target = (dimensions.y - 1 - index) * dimensions.x + col
				fall_rows[target] = survivors[index] if index < survivors.size() else -(index - survivors.size() + 1)
	queue_redraw()

func set_interactive(enabled: bool) -> void:
	interactive = enabled
	if enabled and dragging and pending_release:
		_release.call_deferred()
	queue_redraw()

func tile_size() -> float:
	return maxf(1, minf(size.x / dimensions.x, (size.y - 48) / dimensions.y))

func board_origin() -> Vector2:
	return Vector2(0, 48) + (size - Vector2(0, 48) - Vector2(dimensions) * tile_size()) / 2.0

func cell_center(cell: int) -> Vector2:
	return board_origin() + Vector2(cell % dimensions.x + 0.5, floori(float(cell) / dimensions.x) + 0.5) * tile_size()

func _cell_at(point: Vector2) -> int:
	var tile = tile_size()
	if tile <= 0.0:
		return -1
	var local = point - board_origin()
	var col = floori(local.x / tile)
	var row = floori(local.y / tile)
	if col < 0 or row < 0 or col >= dimensions.x or row >= dimensions.y:
		return -1
	return row * dimensions.x + col

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_press(event.position)
		else:
			_release()
	elif event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
		_move(event.position)

func _input(event: InputEvent) -> void:
	if dragging and event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		_release()

func _press(point: Vector2) -> void:
	if not interactive or dragging:
		return
	var cell = _cell_at(point)
	if cell < 0:
		return
	if targeting:
		cell_targeted.emit(cell)
		return
	dragging = true
	route = [cell]
	last_step = Time.get_ticks_msec() - 125
	route_started.emit()
	route_changed.emit(values.duplicate(), 0)
	queue_redraw()

func _move(point: Vector2) -> void:
	if not interactive or not dragging or route.size() >= max_steps + 1 or Time.get_ticks_msec() - last_step < 125:
		return
	var target = _cell_at(point)
	var held: int = route.back()
	if target < 0 or target == held:
		return
	var dx = target % dimensions.x - held % dimensions.x
	var dy = floori(float(target) / dimensions.x) - floori(float(held) / dimensions.x)
	var next = held + (signi(dx) if absi(dx) >= absi(dy) and dx != 0 else signi(dy) * dimensions.x)
	if not Board.adjacent(held, next, dimensions):
		return
	values = Board.moved(values, held, next)
	route.append(next)
	last_step = Time.get_ticks_msec()
	route_changed.emit(values.duplicate(), route.size() - 1)
	queue_redraw()

func _release() -> void:
	if not dragging:
		return
	if not interactive:
		pending_release = true
		return
	dragging = false
	pending_release = false
	interactive = false
	route_finished.emit(route.duplicate())
	queue_redraw()

func _draw() -> void:
	if values.is_empty() or skins.size() != COLORS.size():
		return
	var step = tile_size()
	var origin = board_origin()
	var frame = Rect2(origin, Vector2(dimensions) * step)
	draw_rect(frame, Color("080a0dc9"))
	draw_rect(frame, Color("c6cbd330"), false, 1)
	var groups = Board.find_groups(values, dimensions) if interactive else []
	var matches: Dictionary = {}
	for group in groups:
		for cell in group.cells:
			matches[cell] = true
	var clearing = {}
	if visual_mode == "clear":
		for group in visual_data.groups:
			for cell in group.cells:
				clearing[cell] = true
	var ai_swap: Array = visual_data.get("path", []) if visual_mode == "ai" else []
	for cell in range(values.size()):
		if cell in ai_swap:
			continue
		var color: int = values[cell]
		if color < 0:
			continue
		var row = float(floori(float(cell) / dimensions.x))
		if visual_mode == "fall" and fall_rows.size() == values.size():
			row = lerpf(float(fall_rows[cell]), row, 1 - pow(1 - visual_progress, 2))
		var rect = Rect2(origin + Vector2(cell % dimensions.x, row) * step + Vector2(2, 2), Vector2.ONE * (step - 4))
		if clearing.has(cell):
			var pulse = sin(minf(1, visual_progress / 0.3) * PI / 2)
			var scale_value = 1 + pulse * 0.09 if visual_progress < 0.3 else lerpf(1.09, 0.15, (visual_progress - 0.3) / 0.7)
			rect = Rect2(rect.get_center() - rect.size * scale_value / 2, rect.size * scale_value)
		_draw_cell(color, rect, 1.0 - visual_progress if clearing.has(cell) else 1.0, frame if visual_mode == "fall" else Rect2())
		if cell in targeted_cells:
			draw_rect(rect.grow(-2), Color.WHITE, false, 3)
		if clearing.has(cell) and visual_progress < 0.52:
			draw_rect(rect, Color(1, 1, 1, sin(visual_progress / 0.52 * PI) * 0.82))
		if matches.has(cell):
			draw_rect(rect.grow(-1), Color("fff6df"), false, 2)
		if dragging and cell == route.back():
			draw_rect(rect.grow(-1), Color.WHITE, false, 2)
	if ai_swap.size() == 2:
		var a = cell_center(ai_swap[0])
		var b = cell_center(ai_swap[1])
		var progress = visual_progress * visual_progress * (3 - 2 * visual_progress)
		draw_line(a, b, Color("ff6a60"), 3, true)
		for index in range(2):
			var center = a.lerp(b, progress) if index == 0 else b.lerp(a, progress)
			var rect = Rect2(center - Vector2.ONE * (step - 4) / 2, Vector2.ONE * (step - 4))
			_draw_cell(values[ai_swap[index]], rect)
			if index == 0:
				draw_rect(rect.grow(1), Color("e3f9ff"), false, 2)
				draw_circle(center, 6, Color("ff7667"), false, 2, true)

func _draw_cell(color: int, rect: Rect2, alpha: float = 1.0, clip: Rect2 = Rect2()) -> void:
	var area = rect.intersection(clip) if clip.has_area() else rect
	if not area.has_area():
		return
	var image_size = TILES[color].get_size()
	var image_source = Rect2((area.position - rect.position) / rect.size * image_size, area.size / rect.size * image_size)
	draw_texture_rect_region(TILES[color], area, image_source, Color(1, 1, 1, alpha))
	var with_name = rect.size.x >= 40 and rect.size.y >= 40
	if with_name and (not clip.has_area() or clip.encloses(rect)):
		var caption: String = SHORT_NAMES[color]
		var extent = FONT.get_string_size(caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 9)
		draw_rect(Rect2(Vector2(rect.position.x + 3, rect.end.y - 16), Vector2(rect.size.x - 6, 13)), Color(0.02, 0.02, 0.035, alpha * 0.88))
		draw_string(FONT, Vector2(rect.get_center().x - extent.x / 2, rect.end.y - 5), caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(1, 1, 1, alpha * 0.9))

func _draw_light(canvas: CanvasItem) -> void:
	if visual_mode != "clear":
		return
	var p = visual_progress
	var tile = tile_size()
	var count = 0
	for group in visual_data.groups:
		var color: Color = COLORS[int(group.color)]
		for cell in group.cells:
			if count >= 32:
				return
			count += 1
			var center = cell_center(cell)
			if p < 0.3:
				FX.sprite(canvas, 3, center, Vector2.ONE * tile * (1.2 - p), Color(color, p * 2.8), p)
			else:
				FX.burst(canvas, center, tile * 0.65, color, (p - 0.3) / 0.7, cell)
			FX.sprite(canvas, 0, center, Vector2.ONE * tile * (0.75 + p * 0.5), Color(color, sin(p * PI) * 0.75), -p)
