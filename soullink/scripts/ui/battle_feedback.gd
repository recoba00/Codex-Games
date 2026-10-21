extends Control

signal step_started(step: Dictionary)
signal step_applied(step: Dictionary)
signal finished

const FX = preload("res://scripts/ui/combat_vfx.gd")
const LightLayer = preload("res://scripts/ui/vfx_layer.gd")
const Portrait = preload("res://scripts/ui/portrait.gd")
const Puzzle = preload("res://scripts/ui/puzzle_board.gd")
const ACCENT = Color("ffb43b")
const ENEMY = Color("ff635b")
var cards: Array = []
var board: Control
var queue: Array = []
var current: Dictionary = {}
var elapsed = 0.0
var ambient = 0.0
var busy = false
var speed = 1.0
var applied = false
var suspended = false
var banner: PanelContainer
var kicker: Label
var title: Label
var subtitle: Label
var ai_label: Label
var number: Label
var chain_label: Label
var light: Control
var combo = 0
var hero_source: TextureRect
var hero_target: TextureRect
var hero_restore: TextureRect
var trails: Array = []
var match_symbol: TextureRect

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 20
	hero_target = _hero()
	for index in range(3):
		trails.append(_hero())
	hero_source = _hero()
	hero_restore = _hero()
	light = LightLayer.new()
	light.source = self
	add_child(light)
	banner = PanelContainer.new()
	banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var skin = StyleBoxEmpty.new()
	skin.content_margin_left = 22
	skin.content_margin_top = 8
	skin.content_margin_bottom = 8
	banner.add_theme_stylebox_override("panel", skin)
	add_child(banner)
	var lines = VBoxContainer.new()
	lines.add_theme_constant_override("separation", 1)
	banner.add_child(lines)
	kicker = _text(9, false)
	title = _text(25, false)
	subtitle = _text(11, false)
	for label in [kicker, title, subtitle]:
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		lines.add_child(label)
	ai_label = _text(12)
	add_child(ai_label)
	chain_label = _text(24)
	add_child(chain_label)
	match_symbol = TextureRect.new()
	match_symbol.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	match_symbol.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	match_symbol.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(match_symbol)
	number = _text(30)
	add_child(number)
	resized.connect(func():
		_layout_labels()
		_redraw())
	cancel()

func _hero() -> TextureRect:
	var portrait = Portrait.new()
	add_child(portrait)
	portrait.hide()
	return portrait

func _text(font_size: int, outline: bool = true) -> Label:
	var label = Label.new()
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_constant_override("outline_size", 6 if outline else 0)
	label.add_theme_color_override("font_outline_color", Color("090b10"))
	return label

func cancel() -> void:
	_restore_cards()
	queue.clear()
	current = {}
	busy = false
	combo = 0
	if is_instance_valid(banner):
		banner.hide()
		ai_label.hide()
		number.hide()
		chain_label.hide()
		match_symbol.hide()
	_redraw()

func play(steps: Array) -> void:
	cancel()
	queue = steps.duplicate(true)
	busy = not queue.is_empty()
	if busy:
		_next()

func _next() -> void:
	_restore_cards()
	banner.hide()
	number.hide()
	chain_label.hide()
	match_symbol.hide()
	if queue.is_empty():
		current = {}
		busy = false
		finished.emit()
		_redraw()
		return
	current = queue.pop_front()
	elapsed = 0.0
	applied = false
	if current.kind == "turn" or current.kind == "notice":
		var enemy: bool = current.get("actor", 0) == 1
		kicker.text = ("OPPONENT / AI CONTROL" if enemy else "PLAYER / LINK READY") if current.kind == "turn" else "SYSTEM / AUTO LINK"
		title.text = current.title
		subtitle.text = current.get("subtitle", "")
		for label in [kicker, title, subtitle]:
			label.add_theme_color_override("font_color", Color("111318"))
		banner.show()
	if current.kind == "impact":
		cards[current.actor].modulate.a = 0.0
		cards[1 - current.actor].modulate.a = 0.0
	elif current.kind == "restore":
		cards[current.actor].modulate.a = 0.0
	if current.has("combo"):
		combo = current.combo
	chain_label.visible = combo > 0 and current.kind in ["match", "impact", "drop", "restore"]
	chain_label.text = "%02d COMBO" % combo
	chain_label.add_theme_font_size_override("font_size", 24)
	if current.kind in ["match", "restore"] and current.has("color"):
		var color: int = current.color
		var count: int = current.effects[0].cells.size() if not current.get("effects", []).is_empty() else 3
		chain_label.text = "%02d COMBO · %s %d개\n%s" % [combo, ["타격", "번개", "질풍", "마나", "황금 치유"][color], count, current.get("caption", "효과 발동")]
		chain_label.add_theme_font_size_override("font_size", 14)
		match_symbol.texture = Puzzle.TILES[color]
		match_symbol.modulate = Color.WHITE
		match_symbol.show()
	if current.has("after"):
		chain_label.visible = true
		chain_label.text = current.title
		chain_label.add_theme_font_size_override("font_size", 20)
	ai_label.visible = current.kind == "ai_move"
	step_started.emit(current)
	_layout_labels()
	_redraw()

func show_ai(enabled: bool) -> void:
	ai_label.visible = enabled
	_layout_labels()
	_redraw()

func set_suspended(value: bool) -> void:
	suspended = value
	_layout_labels()
	_redraw()

func advance(delta: float) -> void:
	ambient += delta
	if busy:
		elapsed += delta * speed
		var progress = clampf(elapsed / current.duration, 0.0, 1.0)
		if not applied and progress >= current.get("apply_at", 0.45):
			applied = true
			step_applied.emit(current)
		if progress >= 1.0:
			_next()
	_layout_labels()
	if busy or ai_label.visible:
		_redraw()

func _redraw() -> void:
	queue_redraw()
	if is_instance_valid(light):
		light.queue_redraw()

func _progress() -> float:
	return clampf(elapsed / current.get("duration", 1.0), 0, 1)

func _layout_labels() -> void:
	_layout_art()
	var entrance = minf(1, elapsed / 0.08)
	var exit_value = minf(1, maxf(0, current.get("duration", 1.0) - elapsed) / 0.09)
	var reveal = minf(entrance, exit_value)
	banner.position = Vector2(16 + (1 - reveal) * (-26 if entrance < 1 else 26), size.y * 0.43 - 42)
	banner.size = Vector2(maxf(0, size.x - 32), 84)
	banner.modulate.a = reveal
	if board != null:
		var rect = board.get_global_rect()
		var grid_y: float = rect.position.y + board.board_origin().y
		var label_y = maxf(rect.position.y + 3, grid_y - 46)
		ai_label.text = "일시 정지" if suspended else "AI 조작 중"
		ai_label.position = Vector2(rect.get_center().x - 76, label_y)
		ai_label.size = Vector2(152, 27)
		chain_label.position = Vector2(rect.position.x, label_y - 5)
		chain_label.size = Vector2(rect.size.x, 44)
		chain_label.add_theme_color_override("font_color", ACCENT if combo >= 3 else Color.WHITE)
		match_symbol.position = Vector2(rect.position.x + 8, label_y + 6)
		match_symbol.size = Vector2(22, 22)
	if number.visible and current.has("target"):
		var rect: Rect2 = cards[current.target].get_global_rect()
		if current.kind == "restore":
			rect = hero_restore.get_global_rect()
		number.size = Vector2(minf(180, size.x - 32), 44)
		number.position = Vector2(clampf(rect.get_center().x - number.size.x / 2, 16, size.x - number.size.x - 16), rect.position.y + rect.size.y * 0.28 - elapsed * 40)

func floating(text: String, target: int, color: Color) -> void:
	current.target = target
	number.text = text
	number.add_theme_font_size_override("font_size", 30 if text.begins_with("HP") else 19)
	number.add_theme_color_override("font_color", color.lightened(0.35))
	number.show()
	_layout_labels()

func _restore_cards() -> void:
	for card in cards:
		if is_instance_valid(card):
			card.modulate.a = 1.0
	for art in [hero_source, hero_target, hero_restore] + trails:
		if is_instance_valid(art):
			art.hide()

func _limit_rect(center: Vector2, extent: Vector2) -> Rect2:
	var bounded = Vector2(minf(extent.x, size.x - 32), minf(extent.y, size.y * 0.48))
	center.x = clampf(center.x, 16 + bounded.x / 2, size.x - 16 - bounded.x / 2)
	center.y = maxf(64 + bounded.y / 2, center.y)
	return Rect2(center - bounded / 2, bounded)

func _place(art: TextureRect, texture: Texture2D, rect: Rect2, tint: Color = Color.WHITE) -> void:
	art.texture = texture
	art.position = rect.position
	art.size = rect.size
	art.modulate = tint
	art.show()

func _layout_art() -> void:
	if not busy or cards.size() != 2:
		return
	var p = _progress()
	var actor: int = current.get("actor", 0)
	if current.kind == "impact":
		var source = _image_rect(cards[actor])
		var victim = _image_rect(cards[1 - actor])
		var strike = _strike(p)
		var zoom = 1 + 1.1 * sin(p * PI)
		var center = source.get_center().lerp(victim.get_center(), strike * 0.82)
		center.y += sin(p * PI) * 40
		var attack = _limit_rect(center, source.size * zoom)
		var kick = maxf(0, 1 - (p - 0.38) / 0.62) if p >= 0.38 else 0.0
		var hit = _limit_rect(victim.get_center() + Vector2(sin(p * 120), cos(p * 91) * 0.45) * 9 * kick, victim.size * (1 + 0.16 * kick))
		_place(hero_target, cards[1 - actor].texture, hit, Color.WHITE.lerp(Color("ffa7a3"), kick * 0.8))
		for index in range(trails.size()):
			var trail = Rect2(attack.position.lerp(source.position, (index + 1) * 0.12), attack.size)
			_place(trails[index], cards[actor].texture, trail, Color(1, 0.65, 0.6, 0.12 * maxf(0, strike)))
		_place(hero_source, cards[actor].texture, attack)
	elif current.kind == "restore":
		var source = _image_rect(cards[actor])
		var pulse = sin(p * PI)
		var rect = _limit_rect(source.get_center() + Vector2((1 if actor == 0 else -1) * 24 * pulse, 22 * pulse), source.size * (1 + pulse * 0.95))
		_place(hero_restore, cards[actor].texture, rect, Color.WHITE.lerp(FX.COLORS[current.get("color", 3)].lightened(0.6), pulse * 0.22))

func _image_rect(card: TextureRect) -> Rect2:
	var rect = card.get_global_rect()
	var image_size = card.texture.get_size()
	var factor = minf(rect.size.x / image_size.x, rect.size.y / image_size.y)
	var fitted = image_size * factor
	return Rect2(rect.get_center() - fitted / 2, fitted)

func _strike(progress: float) -> float:
	if progress < 0.16:
		return -sin(progress / 0.16 * PI / 2) * 0.07
	if progress < 0.38:
		return lerpf(-0.07, 1.0, pow((progress - 0.16) / 0.22, 2.3))
	if progress < 0.52:
		return 1.0
	return pow(maxf(0, 1 - (progress - 0.52) / 0.48), 3)

func _draw() -> void:
	if banner.visible:
		_draw_banner()
	if ai_label.visible:
		var rect = ai_label.get_rect()
		draw_rect(rect, Color("0d0f14f5"))
		draw_rect(rect, Color("c1c7ce"), false, 1)
		draw_rect(Rect2(rect.position, Vector2(3, rect.size.y)), ENEMY)
		for index in range(3):
			draw_rect(Rect2(rect.end - Vector2(16 - index * 4, 7), Vector2(2, 3)), Color(ENEMY, 1 if index == int(ambient * 7) % 3 else 0.22))
	if not busy or cards.size() != 2 or current.kind != "impact":
		return
	var p = _progress()
	var tint = Color("b0edff") if current.get("shield_only", false) else Color("ff9e84")
	draw_rect(Rect2(Vector2(0, 56), Vector2(size.x, size.y - 56)), Color(0.02, 0.025, 0.04, sin(p * PI) * 0.24))
	if p >= 0.38:
		var pulse = pow(maxf(0, 1 - (p - 0.38) / 0.32), 2)
		draw_rect(Rect2(Vector2(0, 56), Vector2(size.x, size.y - 56)), Color(tint, pulse * 0.08))

func _draw_banner() -> void:
	var rect = banner.get_rect()
	var alpha = banner.modulate.a
	var accent = ENEMY if current.get("actor", 0) == 1 else ACCENT
	var polygon = PackedVector2Array([rect.position, rect.position + Vector2(rect.size.x - 12, 0), rect.position + Vector2(rect.size.x, 12), rect.end, rect.position + Vector2(12, rect.size.y), rect.position + Vector2(0, rect.size.y - 12)])
	draw_rect(Rect2(Vector2(0, rect.position.y - 8), Vector2(size.x, rect.size.y + 16)), Color(0.02, 0.025, 0.03, alpha * 0.82))
	draw_colored_polygon(polygon, Color(Color("f3f4f5"), alpha))
	draw_rect(Rect2(rect.position, Vector2(5, rect.size.y - 12)), Color(accent, alpha))
	draw_line(rect.position + Vector2(12, rect.size.y), rect.end, Color(accent, alpha), 2)
	for index in range(3):
		var x = rect.end.x - 24 - index * 13
		var y = rect.get_center().y
		draw_polyline(PackedVector2Array([Vector2(x - 5, y - 9), Vector2(x + 2, y), Vector2(x - 5, y + 9)]), Color(Color("181b20"), alpha * (0.2 + index * 0.3)), 3, true)

func _draw_light(canvas: CanvasItem) -> void:
	if not busy or cards.size() != 2:
		return
	var p = _progress()
	match String(current.kind):
		"match": _draw_match_light(canvas, p)
		"impact":
			var target = 1 - int(current.actor)
			var center = _image_rect(cards[target]).get_center()
			var color: Color = Color("70dfff") if current.get("shield_only", false) else current.get("vfx_color", Color("ff9264"))
			var radius = minf(115, size.x * 0.28)
			if p < 0.38:
				var start = _image_rect(cards[current.actor]).get_center()
				FX.sprite(canvas, 2, start.lerp(center, maxf(0, _strike(p))), Vector2(radius * 1.65, radius), Color(color, p * 1.5), 0 if current.actor == 0 else PI)
			else:
				var hit = (p - 0.38) / 0.62
				FX.burst(canvas, center, radius, color, hit, target)
				FX.sprite(canvas, 2, center, Vector2(radius * 2.4, radius * 1.6), Color(1, 1, 1, pow(1 - hit, 1.5)), -0.2)
				FX.ring(canvas, center + Vector2(0, 22), radius * (0.65 + hit * 0.8), color, hit)
		"effect":
			var rect = _image_rect(cards[current.actor])
			var center = rect.get_center()
			FX.ring(canvas, center + Vector2(0, rect.size.y * 0.35), 76, Color("71dfff"), p)
			FX.sprite(canvas, 3, center, Vector2(115, 150), Color(Color("67d9ff"), sin(p * PI) * 0.9), p * 0.8)
			FX.sprite(canvas, 0, center, Vector2(110, 130), Color(0.7, 0.95, 1, sin(p * PI) * 0.6), -p * 0.25)
		"restore":
			var rect = hero_restore.get_global_rect()
			var center = rect.get_center()
			var color: Color = FX.COLORS[current.get("color", 3)]
			FX.ring(canvas, center + Vector2(0, rect.size.y * 0.35), rect.size.x * 0.9, color, p)
			FX.sprite(canvas, 3, center, rect.size * 1.15, Color(color, sin(p * PI) * 0.7), p * 0.4)
			for index in range(4):
				var point = center + Vector2((index - 1.5) * 26, rect.size.y * (0.35 - p * 0.9) + sin(index * 2.5) * 20)
				canvas.draw_texture_rect(Puzzle.ICONS[current.get("color", 3)], Rect2(point - Vector2(10, 10), Vector2(20, 20)), false, Color(color, sin(p * PI)))
		"burn":
			var center = cards[current.effect.actor].get_global_rect().get_center()
			FX.burst(canvas, center, 62, Color("ff6c32"), p)

func _draw_match_light(canvas: CanvasItem, p: float) -> void:
	var groups: Array = current.get("groups", [])
	for index in range(mini(6, groups.size())):
		var group: Dictionary = groups[index]
		var center = Vector2.ZERO
		for cell in group.cells:
			center += board.cell_center(cell) + board.global_position
		center /= maxf(1, group.cells.size())
		var color: Color = FX.COLORS[int(group.color)]
		var target: int = 1 - int(current.actor) if group.color < 2 else int(current.actor)
		var destination = cards[target].get_global_rect().get_center()
		FX.ring(canvas, center, board.tile_size() * (0.8 + p * 0.75), color, p)
		if p > 0.2:
			FX.stream(canvas, center, destination, color, (p - 0.2) / 0.8, (index - 2) * 18)
		if group.color == 1 and p > 0.5:
			FX.bolt(canvas, center, destination, color, sin((p - 0.5) * 2 * PI) * 0.75)
