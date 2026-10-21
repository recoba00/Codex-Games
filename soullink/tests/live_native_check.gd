extends SceneTree

const LiveContent = preload("res://scripts/ui/live_content.gd")
const Validator = preload("res://scripts/core/live_catalog.gd")
const Catalog = preload("res://scripts/core/catalog.gd")
var client: Node
var done = false

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	client = LiveContent.new()
	root.add_child(client)
	client.catalog_received.connect(_catalog)
	client.image_received.connect(func(id):
		if done:
			return
		if Catalog.remote_textures.has(id):
			done = true
			print("GODOT_LIVE_NATIVE_OK: real HTTP catalog, registered character and verified raster texture")
			quit(0))
	client.start()
	await create_timer(12).timeout
	if not done:
		push_error("Native live content did not load a published uploaded image")
		quit(1)

func _catalog(payload: Dictionary) -> void:
	var applied = Validator.apply(Catalog.load_data(), payload)
	if applied.is_empty() or not applied.characters.has("new_soul"):
		push_error("Native live catalog validation or registration failed")
		quit(1)
		return
	client.request_image(Catalog.image_id(applied.characters.new_soul))
