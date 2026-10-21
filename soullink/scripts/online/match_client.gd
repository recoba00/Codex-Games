extends Node

signal status_changed(text: String)
signal auth_changed(authenticated: bool)
signal room_changed(state: Dictionary)
signal event_received(event: Dictionary)
signal request_failed(message: String)

const CONFIG_PATH = "res://data/online.json"
const SESSION_PATH = "user://online_session.cfg"

var api_url = ""
var access_token = ""
var refresh_token = ""
var expires_at = 0
var user_id = ""
var room_code = ""
var room_state: Dictionary = {}
var authenticated = false
var connected = false

var _http: HTTPRequest
var _pending = ""
var _socket := WebSocketPeer.new()
var _socket_started = false
var _action_sequence = 0
var _queued: Dictionary = {}

func _ready() -> void:
	var file = FileAccess.open(CONFIG_PATH, FileAccess.READ)
	if file == null:
		_fail("온라인 설정을 읽을 수 없습니다")
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary or not parsed.get("api_url", "") is String:
		_fail("온라인 설정 형식이 올바르지 않습니다")
		return
	api_url = String(parsed.api_url).trim_suffix("/")
	_http = HTTPRequest.new()
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)
	_load_session()
	status_changed.emit("온라인 친선전 준비")
	if authenticated:
		auth_changed.emit(true)

func ensure_session() -> void:
	if authenticated and expires_at > int(Time.get_unix_time_from_system()) + 30:
		auth_changed.emit(true)
		return
	if not refresh_token.is_empty():
		status_changed.emit("온라인 세션 확인 중")
		_post("auth_refresh", "/v1/auth/refresh", {"refreshToken": refresh_token}, false)
	else:
		status_changed.emit("게스트 접속 중")
		_post("auth_anonymous", "/v1/auth/anonymous", {}, false)

func create_room(character_id: String, skin_id: String, dimensions: Vector2i) -> void:
	if not authenticated:
		_queued = {"kind": "create", "characterId": character_id, "skinId": skin_id, "dimensions": dimensions}
		ensure_session()
		return
	_create_room_now(character_id, skin_id, dimensions)

func _create_room_now(character_id: String, skin_id: String, dimensions: Vector2i) -> void:
	if not _can_request():
		return
	status_changed.emit("친선전 방 생성 중")
	_post("create", "/v1/rooms", {
		"characterId": character_id,
		"skinId": skin_id,
		"dimensions": {"cols": dimensions.x, "rows": dimensions.y}
	}, true)

func join_room(code: String, character_id: String, skin_id: String) -> void:
	var normalized = code.strip_edges().to_upper()
	if normalized.length() != 8:
		_fail("초대 코드는 8자리입니다")
		return
	if not authenticated:
		_queued = {"kind": "join", "code": normalized, "characterId": character_id, "skinId": skin_id}
		ensure_session()
		return
	_join_room_now(normalized, character_id, skin_id)

func _join_room_now(normalized: String, character_id: String, skin_id: String) -> void:
	if not _can_request():
		return
	status_changed.emit("친선전 참가 중")
	_post("join", "/v1/rooms/%s/join" % normalized, {
		"characterId": character_id,
		"skinId": skin_id
	}, true)

func send_ready() -> void:
	_send_action("ready")

func send_move(path: Array) -> void:
	_send_action("move", {"path": path})

func send_skill() -> void:
	_send_action("skill")

func send_commit() -> void:
	_send_action("commit")

func forfeit() -> void:
	_send_action("forfeit")

func leave_room() -> void:
	if _socket_started:
		_socket.close(1000, "leave")
	_socket_started = false
	connected = false
	room_code = ""
	room_state.clear()
	status_changed.emit("온라인 접속 완료")
	room_changed.emit({})

func _process(_delta: float) -> void:
	if not _socket_started:
		return
	_socket.poll()
	var ready_state = _socket.get_ready_state()
	if ready_state == WebSocketPeer.STATE_OPEN:
		if not connected:
			connected = true
			status_changed.emit("상대 연결 대기 중")
		while _socket.get_available_packet_count() > 0:
			var message = JSON.parse_string(_socket.get_packet().get_string_from_utf8())
			if message is Dictionary:
				_handle_socket_message(message)
	elif ready_state == WebSocketPeer.STATE_CLOSED:
		var was_connected = connected
		connected = false
		_socket_started = false
		if was_connected:
			status_changed.emit("연결이 종료되었습니다")

func _can_request() -> bool:
	if _http == null or _http.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED or not _pending.is_empty():
		_fail("이전 요청을 처리 중입니다")
		return false
	return true

func _post(kind: String, path: String, body: Dictionary, authorized: bool) -> void:
	if _http == null or not _pending.is_empty():
		return
	_pending = kind
	var headers = PackedStringArray(["Content-Type: application/json", "Accept: application/json"])
	if authorized:
		headers.append("Authorization: Bearer %s" % access_token)
	var error = _http.request(api_url + path, headers, HTTPClient.METHOD_POST, JSON.stringify(body))
	if error != OK:
		_pending = ""
		_fail("서버 요청을 시작하지 못했습니다")

func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind = _pending
	_pending = ""
	var body_text = body.get_string_from_utf8()
	var payload = JSON.parse_string(body_text) if not body_text.is_empty() else {}
	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300 or not payload is Dictionary:
		var error_code = String(payload.get("error", "network_error")) if payload is Dictionary else "network_error"
		if kind == "auth_refresh":
			_clear_session()
			ensure_session()
			return
		_fail(_error_text(error_code))
		return
	match kind:
		"auth_anonymous", "auth_refresh":
			_apply_session(payload)
		"create", "join":
			room_code = String(payload.get("roomCode", ""))
			status_changed.emit("방 %s · 소켓 연결 중" % room_code)
			_post("ticket", "/v1/rooms/%s/ticket" % room_code, {}, true)
		"ticket":
			_open_socket(String(payload.get("ticket", "")))

func _apply_session(payload: Dictionary) -> void:
	access_token = String(payload.get("accessToken", ""))
	refresh_token = String(payload.get("refreshToken", ""))
	expires_at = int(payload.get("expiresAt", 0))
	user_id = String(payload.get("userId", ""))
	authenticated = not access_token.is_empty() and not refresh_token.is_empty() and not user_id.is_empty()
	if not authenticated:
		_fail("게스트 세션을 만들지 못했습니다")
		return
	_save_session()
	status_changed.emit("온라인 접속 완료")
	auth_changed.emit(true)
	_run_queued()

func _run_queued() -> void:
	if _queued.is_empty():
		return
	var next = _queued.duplicate(true)
	_queued.clear()
	if next.kind == "create":
		_create_room_now(next.characterId, next.skinId, next.dimensions)
	elif next.kind == "join":
		_join_room_now(next.code, next.characterId, next.skinId)

func _open_socket(ticket: String) -> void:
	if ticket.is_empty() or room_code.is_empty():
		_fail("대전 연결권을 받지 못했습니다")
		return
	_socket = WebSocketPeer.new()
	var socket_url = api_url.replace("https://", "wss://").replace("http://", "ws://")
	var error = _socket.connect_to_url("%s/v1/rooms/%s/ws?ticket=%s" % [socket_url, room_code, ticket.uri_encode()])
	if error != OK:
		_fail("대전 소켓에 연결하지 못했습니다")
		return
	_socket_started = true

func _handle_socket_message(message: Dictionary) -> void:
	var type = String(message.get("type", ""))
	if type == "state":
		room_state = message.duplicate(true)
		var players: Array = room_state.get("players", [])
		var phase_name = String(room_state.get("phase", "lobby"))
		status_changed.emit("방 %s · %d/2명" % [room_code, players.size()] if phase_name == "lobby" else "온라인 대전 시작")
		room_changed.emit(room_state)
	elif type == "error":
		_fail(_error_text(String(message.get("error", "server_error"))))
	else:
		event_received.emit(message)

func _send_action(type: String, extra: Dictionary = {}) -> void:
	if not connected or _socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		_fail("대전 서버에 연결되어 있지 않습니다")
		return
	_action_sequence += 1
	var message = {"type": type, "actionId": "%s_%08d" % [type, _action_sequence]}
	message.merge(extra)
	_socket.send_text(JSON.stringify(message))

func _load_session() -> void:
	var config = ConfigFile.new()
	if config.load(SESSION_PATH) != OK:
		return
	access_token = String(config.get_value("session", "access_token", ""))
	refresh_token = String(config.get_value("session", "refresh_token", ""))
	expires_at = int(config.get_value("session", "expires_at", 0))
	user_id = String(config.get_value("session", "user_id", ""))
	authenticated = not access_token.is_empty() and expires_at > int(Time.get_unix_time_from_system()) + 30

func _save_session() -> void:
	var config = ConfigFile.new()
	config.set_value("session", "access_token", access_token)
	config.set_value("session", "refresh_token", refresh_token)
	config.set_value("session", "expires_at", expires_at)
	config.set_value("session", "user_id", user_id)
	config.save(SESSION_PATH)

func _clear_session() -> void:
	access_token = ""
	refresh_token = ""
	expires_at = 0
	user_id = ""
	authenticated = false
	var config = ConfigFile.new()
	config.save(SESSION_PATH)
	auth_changed.emit(false)

func _fail(message: String) -> void:
	status_changed.emit(message)
	request_failed.emit(message)

func _error_text(code: String) -> String:
	return {
		"catalog_not_published": "공개된 전투 데이터가 없습니다",
		"character_unavailable": "선택한 캐릭터를 사용할 수 없습니다",
		"room_not_found": "초대 코드를 찾을 수 없습니다",
		"room_full": "이미 인원이 찬 방입니다",
		"rate_limited": "요청이 많습니다. 잠시 후 다시 시도해 주세요",
		"daily_room_cap": "오늘의 무료 테스트 방 한도에 도달했습니다",
		"origin_forbidden": "허용되지 않은 게임 주소입니다",
		"auth_session_failed": "게스트 접속에 실패했습니다",
		"auth_refresh_failed": "세션 갱신에 실패했습니다",
		"network_error": "서버 연결을 확인해 주세요"
	}.get(code, "온라인 오류: %s" % code)
