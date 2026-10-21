extends Node

signal catalog_received(payload: Dictionary)
signal image_received(id: String)
signal status_changed(value: String)

const Validator = preload("res://scripts/core/live_catalog.gd")
const Catalog = preload("res://scripts/core/catalog.gd")
var endpoint = ""
var revision = ""
var payload: Dictionary = {}
var busy = false
var foreground = true
var elapsed = 0.0
var interval = 10.0
var image_queue: Array[String] = []
var image_jobs: Dictionary = {}
var failed_images: Dictionary = {}
var cache_root = ""

func start() -> void:
	var config: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/live.json"))
	interval = clampf(float(config.get("poll_seconds", 10)), 5, 300)
	endpoint = config.get("catalog_url", "")
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--content-url="):
			endpoint = argument.trim_prefix("--content-url=")
	if endpoint.is_empty() and OS.has_feature("web"):
		endpoint = JavaScriptBridge.eval("window.SOUL_CONTENT_URL || (/^(localhost|127\\.0\\.0\\.1|192\\.168\\.[0-9]+\\.[0-9]+|10\\.[0-9]+\\.[0-9]+\\.[0-9]+)$/.test(location.hostname) ? location.origin + '/content/catalog.json' : '')", true)
	elif endpoint.is_empty() and OS.is_debug_build():
		endpoint = "http://localhost:5175/content/catalog.json"
	if endpoint.is_empty():
		status_changed.emit("기본 데이터")
		return
	if not endpoint.begins_with("https://") and not Validator._matches(endpoint, "^http://(localhost|127\\.0\\.0\\.1|192\\.168\\.[0-9]+\\.[0-9]+|10\\.[0-9]+\\.[0-9]+\\.[0-9]+)(:[0-9]+)?/[^?#]*$"):
		endpoint = ""
		status_changed.emit("운영 서버 HTTPS 필요")
		return
	cache_root = "user://live-content/" + endpoint.sha256_text()
	DirAccess.make_dir_recursive_absolute(cache_root)
	var cached = _read_bytes(cache_root + "/catalog.json", 1048576)
	if not cached.is_empty():
		var stored: Variant = JSON.parse_string(cached.get_string_from_utf8())
		if Validator.validate(stored):
			_accept(stored)
	refresh()

func refresh() -> void:
	if endpoint.is_empty() or busy or not foreground:
		return
	busy = true
	elapsed = 0
	status_changed.emit("동기화 중")
	var response = await _fetch_bytes(endpoint, 1048576)
	busy = false
	if response.is_empty():
		status_changed.emit("오프라인 · 마지막 데이터" if not payload.is_empty() else "오프라인 · 기본 데이터")
		return
	var next: Variant = JSON.parse_string(response.get_string_from_utf8())
	if not Validator.validate(next):
		status_changed.emit("설정 검증 실패 · 기존 데이터 유지")
		return
	failed_images.clear()
	if next.revision != revision:
		_accept(next)
		var file = FileAccess.open(cache_root + "/catalog.json.tmp", FileAccess.WRITE)
		if file != null:
			file.store_buffer(response)
			file.close()
			DirAccess.rename_absolute(cache_root + "/catalog.json.tmp", cache_root + "/catalog.json")
	status_changed.emit("최신 데이터")

func _accept(next: Dictionary) -> void:
	payload = next.duplicate(true)
	revision = payload.revision
	catalog_received.emit(payload)

func request_image(id: String) -> void:
	if id in ["ignis", "selene", "sylphi"] or Catalog.remote_textures.has(id) or not payload.get("assets", {}).has(id):
		return
	if id in image_queue or image_jobs.has(id) or failed_images.has(id):
		return
	var asset: Dictionary = payload.assets[id]
	var cached = _read_bytes(cache_root + "/" + id, asset.bytes)
	if not cached.is_empty() and _decode(id, asset, cached):
		image_received.emit(id)
		return
	image_queue.append(id)
	_pump_images()

func _pump_images() -> void:
	while image_jobs.size() < 2 and not image_queue.is_empty():
		var id: String = image_queue.pop_front()
		if not payload.get("assets", {}).has(id):
			continue
		image_jobs[id] = true
		_download_image(id, payload.assets[id].duplicate())

func _download_image(id: String, asset: Dictionary) -> void:
	var root = endpoint.substr(0, endpoint.rfind("/") + 1)
	var bytes = await _fetch_bytes(root + asset.path, 3145728)
	if not bytes.is_empty() and _decode(id, asset, bytes):
		var file = FileAccess.open(cache_root + "/" + id, FileAccess.WRITE)
		if file != null:
			file.store_buffer(bytes)
			file.close()
			_prune_cache()
		image_received.emit(id)
	else:
		failed_images[id] = true
		status_changed.emit("이미지 연결 확인 필요")
	image_jobs.erase(id)
	_pump_images()

func _prune_cache() -> void:
	var total = 0
	var images: Array = []
	for name in DirAccess.get_files_at(cache_root):
		if not name.begins_with("asset_") or not Validator._asset_id(name):
			continue
		var file_name = cache_root + "/" + name
		var file = FileAccess.open(file_name, FileAccess.READ)
		if file == null:
			continue
		var bytes = file.get_length()
		file.close()
		total += bytes
		images.append({"path": file_name, "bytes": bytes, "time": FileAccess.get_modified_time(file_name)})
	images.sort_custom(func(a, b): return a.time < b.time)
	for image in images:
		if total <= 67108864:
			break
		if DirAccess.remove_absolute(image.path) == OK:
			total -= image.bytes

func _decode(id: String, asset: Dictionary, bytes: PackedByteArray) -> bool:
	if bytes.size() != asset.bytes:
		return false
	var hash = HashingContext.new()
	hash.start(HashingContext.HASH_SHA256)
	hash.update(bytes)
	if hash.finish().hex_encode() != asset.sha256:
		return false
	var image = Image.new()
	var result = ERR_FILE_CORRUPT
	match asset.ext:
		"png": result = image.load_png_from_buffer(bytes)
		"jpg": result = image.load_jpg_from_buffer(bytes)
		"webp": result = image.load_webp_from_buffer(bytes)
	if result != OK or image.get_width() != asset.width or image.get_height() != asset.height:
		return false
	Catalog.remote_textures[id] = ImageTexture.create_from_image(image)
	return true

func _read_bytes(file_name: String, maximum: int) -> PackedByteArray:
	if not FileAccess.file_exists(file_name):
		return PackedByteArray()
	var file = FileAccess.open(file_name, FileAccess.READ)
	if file == null or file.get_length() > maximum:
		return PackedByteArray()
	return file.get_buffer(file.get_length())

func _fetch_bytes(url: String, maximum: int) -> PackedByteArray:
	var request = HTTPRequest.new()
	request.timeout = 6
	request.body_size_limit = maximum
	request.max_redirects = 0
	add_child(request)
	if request.request(url) != OK:
		request.queue_free()
		return PackedByteArray()
	var response: Array = await request.request_completed
	request.queue_free()
	if response[0] != HTTPRequest.RESULT_SUCCESS or response[1] != 200:
		return PackedByteArray()
	return response[3]

func _process(delta: float) -> void:
	if endpoint.is_empty() or not foreground:
		return
	elapsed += delta
	if elapsed >= interval:
		refresh()
