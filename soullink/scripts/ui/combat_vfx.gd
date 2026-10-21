extends RefCounted

const ATLAS = preload("res://assets/effects/soul-energy-atlas-v1.png")
const COLORS = [Color("ff6257"), Color("65dcff"), Color("a3ff9b"), Color("d1a5ff"), Color("ffd86b")]

static func sprite(canvas: CanvasItem, index: int, center: Vector2, extent: Vector2, tint: Color, angle: float = 0) -> void:
	if tint.a <= 0.001 or extent.x <= 0:
		return
	var cell = ATLAS.get_size() / 2.0
	canvas.draw_set_transform(center, angle)
	canvas.draw_texture_rect_region(ATLAS, Rect2(-extent / 2.0, extent),
		Rect2(Vector2(index % 2, floori(index / 2.0)) * cell, cell), tint)
	canvas.draw_set_transform(Vector2.ZERO)

static func ring(canvas: CanvasItem, center: Vector2, radius: float, color: Color, progress: float) -> void:
	var alpha = sin(clampf(progress, 0, 1) * PI)
	sprite(canvas, 0, center, Vector2(radius * 2, radius * 0.9), Color(color, alpha * 0.85), progress * 0.3)
	sprite(canvas, 3, center - Vector2(0, radius * 0.12), Vector2.ONE * radius * 1.35, Color(color, alpha * 0.32), -progress * 0.6)

static func burst(canvas: CanvasItem, center: Vector2, radius: float, color: Color, progress: float, seed_value: int = 0) -> void:
	var p = clampf(progress, 0, 1)
	var flash = pow(1 - p, 1.6)
	sprite(canvas, 1, center, Vector2.ONE * radius * lerpf(0.5, 2.3, sqrt(p)), Color(color, flash * 0.95), seed_value * 0.73)
	sprite(canvas, 1, center, Vector2.ONE * radius * lerpf(0.3, 0.95, p), Color(1, 1, 1, flash * 0.9), -0.35)
	for index in range(12):
		var angle = index * TAU / 12 + seed_value * 1.7
		var direction = Vector2.from_angle(angle)
		var distance = radius * (0.18 + p * (0.65 + fmod(index * 0.37, 0.7)))
		var point = center + direction * distance + Vector2(0, p * p * radius * 0.2)
		canvas.draw_line(point - direction * radius * (1 - p) * 0.16, point, Color(color, (1 - p) * 0.9), 1.5, true)
		if index % 3 == 0:
			canvas.draw_circle(point, 1.6 * (1 - p), Color(1, 1, 1, flash))

static func stream(canvas: CanvasItem, start: Vector2, end: Vector2, color: Color, progress: float, bend: float = 30) -> void:
	var p = clampf(progress, 0, 1)
	var control = (start + end) / 2.0 + Vector2(bend, -30)
	var previous = start
	for index in range(1, 15):
		var t = maxf(0, p - 0.23) + minf(p, 0.23) * index / 14.0
		var point = (1 - t) * (1 - t) * start + 2 * (1 - t) * t * control + t * t * end
		var alpha = float(index) / 14 * sin(p * PI) * 0.85
		canvas.draw_line(previous, point, Color(color, alpha * 0.15), 10, true)
		canvas.draw_line(previous, point, Color(color, alpha), 3, true)
		canvas.draw_line(previous, point, Color(1, 1, 1, alpha), 1, true)
		previous = point
	sprite(canvas, 1, previous, Vector2.ONE * 30, Color(color, sin(p * PI) * 0.85), p)

static func bolt(canvas: CanvasItem, start: Vector2, end: Vector2, color: Color, strength: float) -> void:
	var previous = start
	for index in range(1, 9):
		var point = start.lerp(end, index / 8.0)
		if index != 8:
			point += Vector2(sin(index * 17.2), cos(index * 8.3)) * 10
		canvas.draw_line(previous, point, Color(color, strength * 0.2), 7, true)
		canvas.draw_line(previous, point, Color(color, strength), 2.3, true)
		canvas.draw_line(previous, point, Color(1, 1, 1, strength), 0.8, true)
		previous = point
