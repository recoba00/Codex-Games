extends Control

var source: Control

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var additive = CanvasItemMaterial.new()
	additive.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	material = additive

func _draw() -> void:
	if is_instance_valid(source):
		source._draw_light(self)
