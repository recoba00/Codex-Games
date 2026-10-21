extends TextureRect

const ROUNDED = preload("res://scripts/ui/portrait.gdshader")

func _init() -> void:
	expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader_material = ShaderMaterial.new()
	shader_material.shader = ROUNDED
	material = shader_material
