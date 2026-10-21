extends Control

const Battle = preload("res://scripts/core/battle.gd")
const Board = preload("res://scripts/core/board.gd")
const PuzzleBoard = preload("res://scripts/ui/puzzle_board.gd")
const BattleFeedback = preload("res://scripts/ui/battle_feedback.gd")
const AudioDirector = preload("res://scripts/ui/audio_director.gd")
const Portrait = preload("res://scripts/ui/portrait.gd")
const Catalog = preload("res://scripts/core/catalog.gd")
const LiveContent = preload("res://scripts/ui/live_content.gd")
const LiveCatalog = preload("res://scripts/core/live_catalog.gd")
const SkinGallery = preload("res://scripts/ui/skin_gallery.gd")
const MatchClient = preload("res://scripts/online/match_client.gd")
const RemoteBattle = preload("res://scripts/online/remote_battle.gd")
const FONT = preload("res://assets/fonts/Pretendard-Regular.otf")
const ACCENT = Color("ffb43b")
const TEXT = Color("f3f4f6")
const MUTED = Color("a5aab3")
const TIMING = {"turn": 0.5, "ai_think": 0.14, "ai_move": 0.28, "match": 0.4, "impact": 0.44, "restore": 0.5, "drop": 0.14, "special": 0.52}
var data: Dictionary
var character = "ignis"
var opponent = "selene"
var spell = "smite"
var board_index = 0
var match_seed = 1001
var game: RefCounted
var preparation: VBoxContainer
var arena: VBoxContainer
var puzzle: Control
var card_buttons: Dictionary = {}
var meters: Array = []
var phase_label: Label
var round_label: Label
var timer_label: Label
var clock: ProgressBar
var feedback: Label
var preview: Label
var active_button: Button
var spell_button: Button
var end_button: Button
var back_button: Button
var pause_button: Button
var help_popup: AcceptDialog
var leave_popup: ConfirmationDialog
var result_popup: Control
var result_label: Label
var result_title: Label
var result_art: TextureRect
var result_name: Label
var result_rematch: Button
var result_change: Button
var legend_buttons: Array = []
var seconds = 15.0
var ai_delay = 0.0
var paused = false
var window_active = true
var popup_paused = false
var in_battle = false
var web_qa = false
var web_host
var host_callback
var host_visible = true
var exit_popup: ConfirmationDialog
var host_error_popup: AcceptDialog
var presentation: Control
var phase = "idle"
var after_presentation: Callable
var shown_fighters: Array = []
var ai_path: Array = []
var display_actor = 0
var presentation_trace: Array = []
var audio: Node
var sound_button: Button
var sound_popup: AcceptDialog
var mute_switch: CheckButton
var music_slider: HSlider
var sfx_slider: HSlider
var character_ids: Array = []
var character_details: Label
var enemy_intent: Label
var action_seconds = 6.0
var reshape_popup: AcceptDialog
var reshape_color = -1
var reshape_cells: Array = []
var ai_skill_done = false
var ai_spell_done = false
var qa_elapsed = 0.0
var live: Node
var live_status: Label
var content_status = "기본 데이터"
var pending_content: Dictionary = {}
var skin_choices: Dictionary = {}
var battle_skins: Array = []
var gallery: Control
var gallery_button: Button
var online_client: Node
var online_status: Label
var online_code: LineEdit
var online_create_button: Button
var online_join_button: Button
var online_ready_button: Button
var online_leave_button: Button
var online_room_label: Label
var online_battle = false
var online_event: Dictionary = {}
var online_waiting = false

func _ready() -> void:
	print("SOUL_LINK_BOOT: ", OS.get_name())
	web_qa = OS.has_feature("web") and "--web-qa" in OS.get_cmdline_user_args()
	if OS.has_feature("web") and not web_qa:
		var qa_host = JavaScriptBridge.get_interface("SoulLinkHost")
		web_qa = qa_host != null and bool(qa_host.qaEnabled)
	print("SOUL_LINK_QA: ", web_qa, " ", OS.get_cmdline_user_args())
	data = Catalog.load_data()
	character_ids = data.characters.keys().filter(func(id): return data.characters[id].enabled)
	character = character_ids[0]
	opponent = character_ids[1]
	print("SOUL_LINK_DATA: ", data.size())
	audio = AudioDirector.new()
	add_child(audio)
	_apply_theme()
	_build_header()
	_build_preparation()
	_build_battle()
	_build_popups()
	_build_sound_options()
	_build_feedback()
	_build_gallery()
	_connect_online()
	show_preparation()
	_connect_live_content()
	_connect_web_host()
	get_viewport().size_changed.connect(_safe_area)
	get_viewport().size_changed.connect(func(): _qa_snapshot.call_deferred())
	_safe_area()
	_qa_snapshot.call_deferred()
	print("SOUL_LINK_UI_READY")
	if "--ui-smoke" in OS.get_cmdline_user_args():
		_smoke.call_deferred()
	if "--capture" in OS.get_cmdline_user_args():
		_capture.call_deferred()

func _apply_theme() -> void:
	var skin = Theme.new()
	skin.default_font = FONT
	skin.default_font_size = 13
	skin.set_color("font_color", "Label", TEXT)
	for widget in ["Button", "OptionButton", "SpinBox"]:
		skin.set_stylebox("normal", widget, _box(Color("17191eea"), Color("656a73")))
		skin.set_stylebox("hover", widget, _box(Color("303239"), TEXT))
		skin.set_stylebox("pressed", widget, _box(Color("43454b"), ACCENT))
		skin.set_stylebox("disabled", widget, _box(Color("101216e8"), Color("363a42")))
		skin.set_color("font_color", widget, TEXT)
		skin.set_color("font_disabled_color", widget, Color("727781"))
	skin.set_stylebox("background", "ProgressBar", _box(Color("ffffff18"), Color.TRANSPARENT, 0))
	skin.set_stylebox("fill", "ProgressBar", _box(TEXT, Color.TRANSPARENT, 0))
	skin.set_stylebox("panel", "AcceptDialog", _box(Color("14161b"), Color("a1a7b0"), 16))
	skin.set_constant("buttons_min_height", "AcceptDialog", 44)
	skin.set_constant("buttons_min_width", "AcceptDialog", 90)
	var window_frame = _box(Color("14161b"), Color("a1a7b0"), 6)
	window_frame.content_margin_top = 28
	skin.set_stylebox("embedded_border", "Window", window_frame)
	skin.set_stylebox("embedded_unfocused_border", "Window", window_frame)
	skin.set_font("title_font", "Window", FONT)
	skin.set_color("title_color", "Window", TEXT)
	theme = skin

func _box(fill: Color, border: Color, margin: int = 8) -> StyleBoxFlat:
	var skin = StyleBoxFlat.new()
	skin.bg_color = fill
	skin.border_color = border
	skin.set_border_width_all(1 if border.a > 0 else 0)
	skin.set_corner_radius_all(0)
	skin.content_margin_left = margin
	skin.content_margin_right = margin
	skin.content_margin_top = margin
	skin.content_margin_bottom = margin
	return skin

func _label(text: String, font_size: int = 13, color: Color = TEXT) -> Label:
	var item = Label.new()
	item.text = text
	item.add_theme_font_size_override("font_size", font_size)
	item.add_theme_color_override("font_color", color)
	item.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return item

func _button(text: String, icon_name: String = "") -> Button:
	var item = Button.new()
	item.text = text
	item.custom_minimum_size.y = 44
	item.pressed.connect(func(): audio.cue("ui"))
	if not icon_name.is_empty():
		item.icon = load("res://assets/icons/" + icon_name + ".svg")
		item.add_theme_constant_override("icon_max_width", 20)
		item.expand_icon = true
		item.custom_minimum_size.x = 44
	return item

func _vbox(gap: int = 8) -> VBoxContainer:
	var item = VBoxContainer.new()
	item.add_theme_constant_override("separation", gap)
	return item

func _hbox(gap: int = 8) -> HBoxContainer:
	var item = HBoxContainer.new()
	item.add_theme_constant_override("separation", gap)
	return item

func _page(page: Control, page_name: String) -> void:
	page.name = page_name
	$SafeArea/Layout/Body/Pages.add_child(page)
	page.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func _build_header() -> void:
	var panel = Panel.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fill = _box(Color("101216eb"), Color.TRANSPARENT, 0)
	fill.border_width_bottom = 1
	fill.border_color = Color("c7ccd33b")
	panel.add_theme_stylebox_override("panel", fill)
	$SafeArea/Layout/Header.add_child(panel)
	$SafeArea/Layout/Header.move_child(panel, 0)
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var header = $SafeArea/Layout/Header/Items
	back_button = _button("", "back")
	back_button.tooltip_text = "대전 준비로"
	back_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(back_button)
	back_button.pressed.connect(_request_back)
	pause_button = _button("", "pause")
	pause_button.tooltip_text = "일시 정지"
	pause_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(pause_button)
	pause_button.pressed.connect(func():
		paused = not paused
		_refresh())
	var help = _button("", "sparkles")
	help.tooltip_text = "블록 효과"
	help.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(help)
	help.pressed.connect(_show_help)
	sound_button = _button("", "settings")
	sound_button.tooltip_text = "사운드 설정"
	sound_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(sound_button)
	sound_button.pressed.connect(func():
		popup_paused = paused
		paused = true
		sound_popup.popup_centered(Vector2i(330, 275))
		_refresh())

func _build_preparation() -> void:
	preparation = _vbox(16)
	_page(preparation, "Preparation")
	var title = _hbox()
	title.add_child(_label("대전 준비", 22))
	var mode = _label("AI 연습전 · 온라인 친선전", 11, MUTED)
	mode.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mode.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	title.add_child(mode)
	preparation.add_child(title)
	var collection_row = _hbox()
	gallery_button = _button("캐릭터 도감", "sparkles")
	gallery_button.name = "Gallery"
	gallery_button.pressed.connect(_open_gallery)
	collection_row.add_child(gallery_button)
	live_status = _label(content_status, 10, MUTED)
	live_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	live_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	live_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	collection_row.add_child(live_status)
	preparation.add_child(collection_row)
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	preparation.add_child(scroll)
	var choices = _vbox(14)
	choices.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(choices)
	choices.add_child(_label("내 캐릭터", 13, MUTED))
	var cards = GridContainer.new()
	cards.columns = 3
	cards.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cards.add_theme_constant_override("h_separation", 6)
	cards.add_theme_constant_override("v_separation", 6)
	choices.add_child(cards)
	for id in character_ids:
		var card = _button("")
		card.name = id
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.custom_minimum_size = Vector2(0, 230)
		cards.add_child(card)
		var margin = MarginContainer.new()
		margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		for side in ["left", "top", "right", "bottom"]:
			margin.add_theme_constant_override("margin_" + side, 6)
		margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(margin)
		var details = _vbox(5)
		details.mouse_filter = Control.MOUSE_FILTER_IGNORE
		margin.add_child(details)
		var portrait = Portrait.new()
		portrait.texture = Catalog.portrait(data.characters[id], _skin_for(id))
		portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		portrait.size_flags_vertical = Control.SIZE_EXPAND_FILL
		portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
		details.add_child(portrait)
		var card_name = _label(data.characters[id].name, 14)
		card_name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		details.add_child(card_name)
		var card_role = _label(data.characters[id].role, 10, MUTED)
		card_role.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		details.add_child(card_role)
		card.pressed.connect(_select_character.bind(id))
		card.tooltip_text = Catalog.stats_text(data.characters[id]) + "\n" + Catalog.passive_text(data.characters[id]) + "\n" + Catalog.active_text(data.characters[id])
		card_buttons[id] = card
		card.set_meta("portrait", portrait)
	character_details = _label("", 12, MUTED)
	character_details.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	choices.add_child(character_details)
	var opponent_choice = OptionButton.new()
	for id in character_ids:
		opponent_choice.add_item(data.characters[id].name)
	opponent_choice.selected = character_ids.find(opponent)
	opponent_choice.item_selected.connect(func(index):
		opponent = character_ids[index]
		_refresh_preparation_art())
	_setting_row(choices, "상대 AI", opponent_choice)
	var spell_choice = OptionButton.new()
	spell_choice.add_item("강타 · 직접 피해 100")
	spell_choice.add_item("방어막 · 보호막 +150")
	spell_choice.add_item("재편 · 퍼즐 2칸 색 변경")
	spell_choice.selected = ["smite", "barrier", "reshape"].find(spell)
	spell_choice.item_selected.connect(func(index): spell = ["smite", "barrier", "reshape"][index])
	_setting_row(choices, "스펠 · 경기당 1회", spell_choice)
	var board_choice = OptionButton.new()
	for size_value in data.board_sizes:
		board_choice.add_item("%d × %d · %d칸" % [size_value.cols, size_value.rows, size_value.cols * size_value.rows])
	board_choice.selected = board_index
	board_choice.item_selected.connect(func(index): board_index = index)
	_setting_row(choices, "보드", board_choice)
	_build_online_controls(choices)
	var summary = _label("기본 타격 %d · 상성 보너스 %d%%\n퍼즐 %d초 · 행동 %d초 · 최대 %d라운드" % [data.combat.baseStrike, roundi(data.combat.elementBonus * 100), data.practice.turnSeconds, data.combat.actionSeconds, data.game_limits.rounds], 12, MUTED)
	choices.add_child(summary)
	var start = _button("대전 시작", "end")
	start.name = "Start"
	start.custom_minimum_size.y = 48
	start.add_theme_stylebox_override("normal", _box(ACCENT, ACCENT))
	start.add_theme_stylebox_override("hover", _box(Color("ffd18b"), Color.WHITE))
	start.add_theme_stylebox_override("pressed", _box(Color("d88b22"), ACCENT))
	start.add_theme_color_override("font_color", Color("111318"))
	start.add_theme_color_override("font_hover_color", Color("111318"))
	start.add_theme_color_override("font_pressed_color", Color("111318"))
	start.pressed.connect(start_match)
	preparation.add_child(start)
	_select_character(character)
	_refresh_preparation_art()
	if online_client != null:
		_online_room_changed(online_client.room_state)

func _build_online_controls(parent: Control) -> void:
	var section = _vbox(8)
	section.name = "OnlineFriendly"
	parent.add_child(section)
	var heading = _hbox(8)
	heading.add_child(_label("온라인 친선전", 14))
	online_status = _label("온라인 친선전 준비", 10, MUTED)
	online_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	online_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	heading.add_child(online_status)
	section.add_child(heading)
	online_room_label = _label("", 18, ACCENT)
	online_room_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	online_room_label.hide()
	section.add_child(online_room_label)
	var actions = _hbox(6)
	online_create_button = _button("방 만들기", "sparkles")
	online_create_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	online_create_button.pressed.connect(_create_online_room)
	actions.add_child(online_create_button)
	online_code = LineEdit.new()
	online_code.placeholder_text = "초대 코드 8자리"
	online_code.max_length = 8
	online_code.custom_minimum_size = Vector2(116, 44)
	online_code.text_changed.connect(func(value):
		var normalized = value.to_upper()
		if normalized != value:
			online_code.text = normalized
			online_code.caret_column = online_code.text.length()
		online_join_button.disabled = online_code.text.length() != 8 or (online_client != null and not online_client.room_code.is_empty()))
	actions.add_child(online_code)
	online_join_button = _button("참가", "end")
	online_join_button.disabled = true
	online_join_button.pressed.connect(_join_online_room)
	actions.add_child(online_join_button)
	section.add_child(actions)
	var room_actions = _hbox(6)
	online_ready_button = _button("대전 준비", "swords")
	online_ready_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	online_ready_button.hide()
	online_ready_button.pressed.connect(func(): online_client.send_ready())
	room_actions.add_child(online_ready_button)
	online_leave_button = _button("나가기", "back")
	online_leave_button.hide()
	online_leave_button.pressed.connect(func(): online_client.leave_room())
	room_actions.add_child(online_leave_button)
	section.add_child(room_actions)

func _connect_online() -> void:
	online_client = MatchClient.new()
	online_client.status_changed.connect(func(value):
		if online_status != null:
			online_status.text = value)
	online_client.auth_changed.connect(func(ready):
		if online_create_button != null:
			online_create_button.disabled = not online_client.room_code.is_empty()
			online_join_button.disabled = online_code.text.length() != 8 or not online_client.room_code.is_empty())
	online_client.room_changed.connect(_online_room_changed)
	online_client.event_received.connect(_online_event_received)
	online_client.request_failed.connect(func(message):
		if online_status != null:
			online_status.text = message
			online_create_button.disabled = not online_client.room_code.is_empty()
			online_join_button.disabled = online_code.text.length() != 8 or not online_client.room_code.is_empty())
	add_child(online_client)

func _create_online_room() -> void:
	var size_value: Dictionary = data.board_sizes[board_index]
	online_create_button.disabled = true
	online_join_button.disabled = true
	online_client.create_room(character, _skin_for(character), Vector2i(size_value.cols, size_value.rows))

func _join_online_room() -> void:
	online_create_button.disabled = true
	online_join_button.disabled = true
	online_client.join_room(online_code.text, character, _skin_for(character))

func _online_room_changed(state: Dictionary) -> void:
	var active = not state.is_empty()
	online_room_label.visible = active
	online_ready_button.visible = active
	online_leave_button.visible = active
	online_code.editable = not active
	online_create_button.disabled = active
	online_join_button.disabled = active or online_code.text.length() != 8
	if not active:
		online_room_label.text = ""
		online_ready_button.text = "대전 준비"
		online_ready_button.disabled = false
		if online_battle:
			show_preparation()
		return
	var players: Array = state.get("players", [])
	online_room_label.text = "초대 코드  %s" % String(state.get("roomCode", online_client.room_code))
	var seat = int(state.get("youSeat", -1))
	var mine_ready = seat >= 0 and seat < players.size() and bool(players[seat].get("ready", false))
	var phase_name = String(state.get("phase", "lobby"))
	online_ready_button.text = "상대 준비 대기" if mine_ready else "대전 준비"
	online_ready_button.disabled = mine_ready or phase_name != "lobby"
	if phase_name == "battle":
		online_ready_button.text = "온라인 대전 연결됨"
		if not online_battle:
			_start_online_battle(state)
		else:
			_sync_online_battle(state)
	elif phase_name == "finished" and online_battle:
		_sync_online_battle(state)

func _online_event_received(event: Dictionary) -> void:
	var kind = String(event.get("type", ""))
	if kind in ["receipt", "timeout"]:
		online_event = event.duplicate(true)
	elif kind == "presence" and online_battle:
		var connected = bool(event.get("connected", false))
		feedback.text = "상대가 다시 연결되었습니다" if connected else "상대 연결이 끊겼습니다 · 복귀 대기 중"
		_refresh()

func _start_online_battle(state: Dictionary) -> void:
	var match_data: Dictionary = state.get("match", {})
	if match_data.is_empty():
		return
	var players: Array = state.get("players", [])
	var seat = int(state.get("youSeat", 0))
	if players.size() < 2 or seat < 0 or seat > 1:
		return
	character = String(players[seat].get("characterId", character))
	opponent = String(players[1 - seat].get("characterId", opponent))
	battle_skins = [String(players[seat].get("skinId", "base")), String(players[1 - seat].get("skinId", "base"))]
	game = RemoteBattle.new(state)
	online_battle = true
	online_waiting = false
	online_event.clear()
	result_popup.hide()
	presentation.cancel()
	audio.music("battle")
	after_presentation = Callable()
	shown_fighters.clear()
	presentation_trace.clear()
	in_battle = true
	paused = false
	preparation.hide()
	arena.show()
	back_button.show()
	feedback.text = "서버 동기화 완료 · 모든 판정은 온라인 서버에서 처리됩니다"
	_begin_online_turn()

func _sync_online_battle(state: Dictionary) -> void:
	if game == null or not online_battle:
		_start_online_battle(state)
		return
	var previous_fighters = game.fighters.duplicate(true)
	var previous_stage = game.stage
	var previous_actor = game.actor
	var previous_round = game.round_number
	var receipt: Dictionary = online_event.get("receipt", {})
	online_event.clear()
	game.apply_state(state)
	online_waiting = false
	display_actor = game.actor
	puzzle.present(game.boards[game.actor], game.dimensions, false, floori((game.turn_seconds - 0.5) * 8))
	if game.result != null:
		if not receipt.is_empty():
			_play_online_receipt(receipt, previous_fighters, _show_result)
		else:
			_refresh()
			_show_result()
		return
	if not receipt.is_empty():
		game.record_receipt(receipt)
		_play_online_receipt(receipt, previous_fighters, _online_after_receipt)
	elif previous_stage == "puzzle" and game.stage == "action":
		_play_online_match(previous_fighters)
	elif previous_stage == "action" and game.stage == "puzzle" or previous_actor != game.actor or previous_round != game.round_number:
		_begin_online_turn()
	else:
		_online_state_ready()

func _begin_online_turn() -> void:
	_cancel_reshape()
	display_actor = game.actor
	shown_fighters.clear()
	phase = "turn_intro"
	puzzle.present(game.boards[game.actor], game.dimensions, false, floori((game.turn_seconds - 0.5) * 8))
	var actor_name = data.characters[game.fighters[game.actor].character].name
	preview.text = "기본 타격 %d · 빨강 매치로 추가 피해\n%s" % [data.combat.baseStrike, Catalog.passive_text(data.characters[game.fighters[game.actor].character])]
	after_presentation = _online_state_ready
	presentation.play([{"kind": "turn", "actor": game.actor, "duration": TIMING.turn,
		"title": "나의 턴" if game.actor == 0 else "상대 턴", "subtitle": "%02d ROUND · %s" % [game.round_number, actor_name]}])
	_refresh()

func _online_state_ready() -> void:
	shown_fighters.clear()
	if game.result != null:
		_show_result()
		return
	phase = "player_input" if game.actor == 0 and game.stage == "puzzle" else "player_action" if game.actor == 0 else "opponent_wait"
	display_actor = game.actor
	if game.stage == "action" and game.actor == 0:
		_action_preview()
	elif game.actor == 1:
		preview.text = "상대가 퍼즐과 행동을 선택하고 있습니다\n서버 제한시간 종료 시 자동으로 진행됩니다"
	_refresh()

func _online_after_receipt() -> void:
	shown_fighters.clear()
	if game.result != null:
		_show_result()
	elif game.stage == "puzzle":
		_begin_online_turn()
	else:
		_online_state_ready()

func _play_online_match(before: Array) -> void:
	var groups: Array = game.pending.get("groups", [])
	var effects: Array = []
	for raw in game.pending.get("effects", []):
		var effect: Dictionary = raw.duplicate(true)
		effect["actor"] = game.actor
		effect["damage"] = 0
		effect["shield"] = 0
		effect["burn"] = 0
		effects.append(effect)
	feedback.text = "%s 직접 %d콤보 / 전체 %d · HP +%d · MP +%d%s" % ["나" if game.actor == 0 else "상대", game.pending.manualCombo, groups.size(),
		game.pending.healing, game.pending.manaGain, " · 자동 보정" if game.pending.get("assisted", false) else ""]
	phase = "resolving"
	shown_fighters = before
	var subtitle = _effect_caption(effects) if not effects.is_empty() else "기본 타격 준비"
	after_presentation = _online_state_ready
	presentation.play([{"kind": "notice", "title": "퍼즐 매치 · %d콤보" % groups.size(), "subtitle": subtitle, "duration": 0.42}])
	_refresh()

func _play_online_receipt(receipt: Dictionary, before: Array, next: Callable) -> void:
	var receipt_type = String(receipt.get("type", ""))
	var server_seat = int(receipt.get("seat", state_seat())) if receipt_type == "turn" else _server_actor_from_visual(game.actor)
	var visual_actor = 0 if server_seat == state_seat() else 1
	var damage = int(receipt.get("damage", receipt.get("strike", {}).get("damage", 0)))
	var absorbed = int(receipt.get("shield", receipt.get("strike", {}).get("shield", 0)))
	var critical = bool(receipt.get("critical", receipt.get("strike", {}).get("critical", false)))
	var title = String(receipt.get("skill", "스킬 발동")) if receipt_type == "skill" else "기본 타격"
	if critical:
		title += " · 치명타"
	var caption = "HP −%d" % damage if damage > 0 else "보호막 −%d" % absorbed if absorbed > 0 else "공격 무효"
	phase = "special" if receipt_type == "skill" else "resolving"
	display_actor = visual_actor
	shown_fighters = before
	after_presentation = next
	presentation.play([{"kind": "impact", "duration": TIMING.special if receipt_type == "skill" else TIMING.impact, "apply_at": 0.38,
		"actor": visual_actor, "title": title, "caption": caption, "after": game.fighters.duplicate(true), "damage": damage,
		"vfx_color": Color(data.characters[game.fighters[visual_actor].character].color), "shield_only": damage == 0,
		"shield_gain": 0, "absorbed": absorbed}])
	_refresh()

func state_seat() -> int:
	return game.seat if online_battle and game != null else 0

func _server_actor_from_visual(visual_side: int) -> int:
	return state_seat() if visual_side == 0 else 1 - state_seat()

func _build_gallery() -> void:
	gallery = SkinGallery.new()
	_page(gallery, "Gallery")
	gallery.closed.connect(_close_gallery)
	gallery.image_needed.connect(func(id):
		if live != null:
			live.request_image(id))
	gallery.skin_selected.connect(func(id, skin):
		skin_choices[id] = skin
		var config = ConfigFile.new()
		for key in skin_choices:
			config.set_value("skins", key, skin_choices[key])
		config.save("user://appearance.cfg")
		_refresh_preparation_art())

func _connect_live_content() -> void:
	var config = ConfigFile.new()
	if config.load("user://appearance.cfg") == OK and config.has_section("skins"):
		for id in config.get_section_keys("skins"):
			var value: Variant = config.get_value("skins", id, "")
			if value is String:
				skin_choices[id] = value
	live = LiveContent.new()
	add_child(live)
	live.catalog_received.connect(func(payload):
		pending_content = payload.duplicate(true)
		if not in_battle:
			_apply_pending_content())
	live.status_changed.connect(func(value):
		content_status = value
		live_status.text = value)
	live.image_received.connect(func(_id):
		_refresh_preparation_art()
		if gallery.visible:
			gallery.refresh_images()
		if in_battle:
			_refresh()
		_trim_live_textures())
	live.start()
	_refresh_preparation_art()

func _skin_for(id: String) -> String:
	return Catalog.skin_id(data.characters[id], skin_choices.get(id, ""))

func _refresh_preparation_art() -> void:
	for id in card_buttons:
		var info: Dictionary = data.characters[id]
		card_buttons[id].get_meta("portrait").texture = Catalog.portrait(info, _skin_for(id))
		if live != null:
			live.request_image(Catalog.image_id(info, _skin_for(id)))
	if preparation.has_node("Start"):
		preparation.get_node("Start").disabled = Catalog.portrait(data.characters[character], _skin_for(character)) == null or Catalog.portrait(data.characters[opponent]) == null
	if live != null:
		live.request_image(Catalog.image_id(data.characters[opponent]))

func _apply_pending_content() -> void:
	if pending_content.is_empty():
		return
	var next = LiveCatalog.apply(Catalog.load_data(), pending_content)
	pending_content.clear()
	if next.is_empty():
		return
	data = next
	character_ids = data.characters.keys().filter(func(id): return data.characters[id].enabled)
	if not character in character_ids:
		character = character_ids[0]
	if not opponent in character_ids:
		opponent = character_ids[1]
	var was_visible = preparation.visible
	preparation.get_parent().remove_child(preparation)
	preparation.queue_free()
	card_buttons.clear()
	character_details = null
	_build_preparation()
	preparation.visible = was_visible
	if gallery.visible:
		gallery.configure(data, skin_choices)
	_trim_live_textures()
	_qa_snapshot.call_deferred()

func _open_gallery() -> void:
	if in_battle:
		return
	_apply_pending_content()
	preparation.hide()
	gallery.show()
	gallery.configure(data, skin_choices, character)
	_trim_live_textures()
	back_button.show()
	live.refresh()
	_qa_snapshot.call_deferred()

func _close_gallery() -> void:
	gallery.hide()
	show_preparation()
	_trim_live_textures()

func _trim_live_textures() -> void:
	var keep: Array = []
	for id in character_ids:
		keep.append(Catalog.image_id(data.characters[id], _skin_for(id)))
	keep.append(Catalog.image_id(data.characters[opponent]))
	if gallery != null and gallery.visible:
		keep.append_array(gallery.image_ids())
	if in_battle and battle_skins.size() == 2:
		keep.append(Catalog.image_id(data.characters[character], battle_skins[0]))
		keep.append(Catalog.image_id(data.characters[opponent], battle_skins[1]))
	Catalog.trim_textures(keep)

func _setting_row(parent: Control, title: String, option: Control) -> void:
	var row = _vbox(5)
	row.add_child(_label(title, 12, MUTED))
	option.custom_minimum_size.y = 44
	row.add_child(option)
	parent.add_child(row)

func _select_character(id: String) -> void:
	character = id
	if character_details != null:
		var info: Dictionary = data.characters[id]
		character_details.text = "HP %d · 공격력 %d\n%s\n%s" % [info.stats.max_hp, info.stats.attack, Catalog.passive_text(info), Catalog.active_text(info)]
	for key in card_buttons:
		var color = ACCENT if key == id else Color("545964")
		card_buttons[key].add_theme_stylebox_override("normal", _box(Color("15171dd9"), color))
	_refresh_preparation_art()

func _build_battle() -> void:
	arena = _vbox(6)
	_page(arena, "Battle")
	var actors = _hbox(12)
	actors.custom_minimum_size.y = 152
	arena.add_child(actors)
	for side in range(2):
		var actor_box = _hbox(6)
		actor_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		actors.add_child(actor_box)
		var portrait = Portrait.new()
		portrait.custom_minimum_size = Vector2(96, 148)
		portrait.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		actor_box.add_child(portrait)
		var stats = _vbox(3)
		stats.custom_minimum_size.x = 57
		stats.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		actor_box.add_child(stats)
		var name_label = _label("", 10)
		name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var hp_label = _label("", 14)
		var hp = _meter(5)
		var mana_label = _label("", 10, Color("d1a5ff"))
		var mp = _meter(3)
		var statuses = _label("", 9, MUTED)
		for item in [name_label, hp_label, hp, mana_label, mp, statuses]:
			stats.add_child(item)
		meters.append({"portrait": portrait, "name": name_label, "hpLabel": hp_label, "hp": hp, "mpLabel": mana_label, "mp": mp, "statuses": statuses})
	var turn = _hbox()
	phase_label = _label("나의 턴", 14, TEXT)
	phase_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	turn.add_child(phase_label)
	round_label = _label("", 10, MUTED)
	turn.add_child(round_label)
	timer_label = _label("15.0", 21)
	timer_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	timer_label.custom_minimum_size.x = 52
	turn.add_child(timer_label)
	arena.add_child(turn)
	clock = _meter(3)
	arena.add_child(clock)
	enemy_intent = _label("", 10, MUTED)
	enemy_intent.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	arena.add_child(enemy_intent)
	var legend = _hbox(4)
	for index in range(data.blocks.size()):
		var block: Dictionary = data.blocks[index]
		var key = _button(["공격", "MP차감", "강화", "MP충전", "HP회복"][index], block.icon)
		key.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		key.add_theme_font_size_override("font_size", 9)
		key.add_theme_constant_override("icon_max_width", 14)
		key.add_theme_constant_override("h_separation", 2)
		key.icon = PuzzleBoard.TILES[index]
		key.add_theme_stylebox_override("normal", _box(Color("11151bde"), Color(PuzzleBoard.COLORS[index], 0.5), 3))
		key.tooltip_text = block.description
		key.add_theme_color_override("font_color", PuzzleBoard.COLORS[index])
		key.pressed.connect(_show_help.bind(index))
		legend.add_child(key)
		legend_buttons.append(key)
	arena.add_child(legend)
	puzzle = PuzzleBoard.new()
	puzzle.name = "Puzzle"
	puzzle.size_flags_vertical = Control.SIZE_EXPAND_FILL
	arena.add_child(puzzle)
	puzzle.route_started.connect(_refresh)
	puzzle.route_changed.connect(_preview_route)
	puzzle.route_finished.connect(func(path): finish_turn(path))
	puzzle.cell_targeted.connect(_reshape_target)
	preview = _label("", 13, TEXT)
	preview.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	preview.custom_minimum_size.y = 48
	arena.add_child(preview)
	var actions = _hbox(4)
	active_button = _button("", "flame")
	active_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	active_button.add_theme_font_size_override("font_size", 11)
	active_button.clip_text = true
	active_button.pressed.connect(_use_special.bind("active"))
	actions.add_child(active_button)
	spell_button = _button("", "swords")
	spell_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spell_button.add_theme_font_size_override("font_size", 11)
	spell_button.pressed.connect(_use_special.bind("spell"))
	actions.add_child(spell_button)
	end_button = _button("", "end")
	end_button.tooltip_text = "턴 종료"
	end_button.add_theme_stylebox_override("normal", _box(ACCENT, ACCENT))
	end_button.add_theme_color_override("icon_normal_color", Color("111318"))
	end_button.pressed.connect(_confirm_turn)
	actions.add_child(end_button)
	arena.add_child(actions)
	feedback = _label("", 10, MUTED)
	feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	feedback.custom_minimum_size.y = 28
	arena.add_child(feedback)

func _meter(height: int) -> ProgressBar:
	var item = ProgressBar.new()
	item.custom_minimum_size.y = height
	item.show_percentage = false
	item.max_value = 100
	return item

func _build_popups() -> void:
	reshape_popup = AcceptDialog.new()
	reshape_popup.title = "재편 · 변경할 속성"
	reshape_popup.get_ok_button().text = "취소"
	var swatches = _hbox(4)
	for color in range(5):
		var choice = _button("", "sparkles")
		choice.icon = PuzzleBoard.TILES[color]
		choice.custom_minimum_size = Vector2(52, 52)
		choice.tooltip_text = data.blocks[color].name
		choice.pressed.connect(func():
			reshape_popup.hide()
			reshape_color = color
			reshape_cells.clear()
			puzzle.targeting = true
			preview.text = "재편 · %s · 0 / 2칸" % data.blocks[color].name
			_refresh())
		swatches.add_child(choice)
	reshape_popup.add_child(swatches)
	add_child(reshape_popup)
	reshape_popup.visibility_changed.connect(func():
		if not reshape_popup.visible:
			paused = popup_paused
			_refresh())
	help_popup = AcceptDialog.new()
	help_popup.theme = theme
	help_popup.title = "블록 효과"
	help_popup.dialog_autowrap = true
	help_popup.get_ok_button().text = "닫기"
	add_child(help_popup)
	help_popup.visibility_changed.connect(func():
		if not help_popup.visible:
			paused = popup_paused
			_refresh())
	leave_popup = ConfirmationDialog.new()
	leave_popup.theme = theme
	leave_popup.title = "대전 준비로 돌아갈까요?"
	leave_popup.dialog_autowrap = true
	leave_popup.dialog_text = "진행 중인 연습전은 종료됩니다."
	leave_popup.get_ok_button().text = "준비로"
	leave_popup.get_cancel_button().text = "계속 대전"
	add_child(leave_popup)
	leave_popup.confirmed.connect(_leave_current_battle)
	leave_popup.canceled.connect(func():
		paused = popup_paused
		_refresh())
	_build_result()
	exit_popup = ConfirmationDialog.new()
	exit_popup.theme = theme
	exit_popup.title = "소울링크를 종료할까요?"
	exit_popup.dialog_text = "언제든 다시 연습전을 시작할 수 있어요."
	exit_popup.get_ok_button().text = "종료"
	exit_popup.get_cancel_button().text = "계속하기"
	add_child(exit_popup)
	exit_popup.confirmed.connect(func():
		if web_host != null:
			web_host.requestClose())
	host_error_popup = AcceptDialog.new()
	host_error_popup.theme = theme
	host_error_popup.title = "종료하지 못했어요"
	host_error_popup.dialog_text = "상단 닫기 버튼으로 나가거나 잠시 후 다시 시도해 주세요."
	add_child(host_error_popup)

func _build_result() -> void:
	result_popup = Control.new()
	_page(result_popup, "Result")
	result_popup.z_index = 30
	var backdrop = ColorRect.new()
	backdrop.color = Color("0c1018f5")
	result_popup.add_child(backdrop)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var margin = MarginContainer.new()
	result_popup.add_child(margin)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 8)
	var layout = _vbox(10)
	margin.add_child(layout)
	var kicker = _label("DUEL COMPLETE", 11, MUTED)
	kicker.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	layout.add_child(kicker)
	result_title = _label("VICTORY", 34, ACCENT)
	result_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	layout.add_child(result_title)
	result_art = Portrait.new()
	result_art.size_flags_vertical = Control.SIZE_EXPAND_FILL
	layout.add_child(result_art)
	result_name = _label("", 23)
	result_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	layout.add_child(result_name)
	result_label = _label("", 12, MUTED)
	result_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result_label.custom_minimum_size.y = 62
	layout.add_child(result_label)
	var actions = _hbox(8)
	layout.add_child(actions)
	result_change = _button("선택 변경", "back")
	result_rematch = _button("다시 대전", "replay")
	for button in [result_change, result_rematch]:
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		actions.add_child(button)
	result_rematch.add_theme_stylebox_override("normal", _box(ACCENT, ACCENT))
	result_rematch.add_theme_color_override("font_color", Color("111318"))
	result_rematch.pressed.connect(func():
		match_seed += 1
		start_match())
	result_change.pressed.connect(show_preparation)
	result_popup.hide()

func _build_feedback() -> void:
	presentation = BattleFeedback.new()
	presentation.name = "CombatFeedback"
	add_child(presentation)
	presentation.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	presentation.board = puzzle
	presentation.cards = [meters[0].portrait, meters[1].portrait]
	presentation.step_started.connect(_presentation_step)
	presentation.step_applied.connect(_presentation_apply)
	presentation.finished.connect(func():
		var next = after_presentation
		after_presentation = Callable()
		if in_battle and next.is_valid():
			next.call())

func _build_sound_options() -> void:
	sound_popup = AcceptDialog.new()
	sound_popup.theme = theme
	sound_popup.title = "사운드"
	sound_popup.get_ok_button().text = "닫기"
	add_child(sound_popup)
	var controls = _vbox(12)
	controls.custom_minimum_size = Vector2(280, 190)
	sound_popup.add_child(controls)
	mute_switch = CheckButton.new()
	mute_switch.text = "전체 음소거"
	mute_switch.custom_minimum_size.y = 44
	mute_switch.button_pressed = audio.muted
	controls.add_child(mute_switch)
	var sliders: Array = []
	for entry in [["배경 음악", audio.music_volume], ["효과음", audio.sfx_volume]]:
		var row = _vbox(3)
		var caption = _hbox()
		var label = _label(entry[0], 13)
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		caption.add_child(label)
		var amount = _label(str(roundi(entry[1] * 100)) + "%", 12, MUTED)
		caption.add_child(amount)
		row.add_child(caption)
		var slider = HSlider.new()
		slider.min_value = 0
		slider.max_value = 100
		slider.step = 1
		slider.value = entry[1] * 100
		slider.custom_minimum_size = Vector2(280, 36)
		slider.value_changed.connect(func(value): amount.text = str(roundi(value)) + "%")
		row.add_child(slider)
		controls.add_child(row)
		sliders.append(slider)
	music_slider = sliders[0]
	sfx_slider = sliders[1]
	mute_switch.toggled.connect(func(_value): _configure_audio())
	music_slider.value_changed.connect(func(_value): _configure_audio())
	sfx_slider.value_changed.connect(func(_value): _configure_audio())
	sfx_slider.drag_ended.connect(func(_changed): audio.cue("turn"))
	sound_popup.visibility_changed.connect(func():
		if not sound_popup.visible:
			paused = popup_paused
			_refresh())

func _configure_audio() -> void:
	audio.configure(music_slider.value / 100, sfx_slider.value / 100, mute_switch.button_pressed)
	_qa_snapshot.call_deferred()

func _connect_web_host() -> void:
	if not OS.has_feature("web"):
		return
	web_host = JavaScriptBridge.get_interface("SoulLinkHost")
	if web_host == null:
		return
	host_callback = JavaScriptBridge.create_callback(_on_host_event)
	web_host.setListener(host_callback)

func _on_host_event(arguments: Array) -> void:
	if arguments.is_empty() or not arguments[0] is String:
		return
	var message = JSON.parse_string(arguments[0])
	if not message is Dictionary:
		return
	match message.get("type", ""):
		"visibility":
			if message.get("visible") is bool:
				host_visible = message.visible
				_refresh()
		"back":
			_request_back()
		"close-failed":
			host_error_popup.popup_centered(Vector2i(330, 160))

func _request_back() -> void:
	if gallery.visible:
		_close_gallery()
	elif reshape_popup.visible:
		reshape_popup.hide()
	elif reshape_color >= 0:
		_cancel_reshape()
	elif sound_popup.visible:
		sound_popup.hide()
	elif exit_popup.visible:
		exit_popup.hide()
	elif host_error_popup.visible:
		host_error_popup.hide()
	elif help_popup.visible:
		help_popup.hide()
	elif leave_popup.visible:
		leave_popup.hide()
		paused = popup_paused
		_refresh()
	elif result_popup.visible:
		result_popup.hide()
		show_preparation()
	elif not in_battle:
		if not exit_popup.visible:
			exit_popup.popup_centered(Vector2i(330, 160))
	else:
		popup_paused = paused
		paused = true
		puzzle.set_interactive(false)
		leave_popup.popup_centered(Vector2i(330, 160))
	_refresh()
	_qa_snapshot.call_deferred()

func _exit_tree() -> void:
	if web_host != null:
		web_host.clearListener()
	host_callback = null

func _show_help(block_index: int = -1) -> void:
	popup_paused = paused
	paused = true
	puzzle.set_interactive(false)
	var lines: PackedStringArray = []
	for index in range(data.blocks.size()):
		if block_index >= 0 and index != block_index:
			continue
		var block: Dictionary = data.blocks[index]
		lines.append("%s → %s\n%s" % [block.name, block.target, block.description])
	lines.append("기본 타격 %d · 모든 매치 MP +%d · 충전 한도 %d\n매칭 후 스킬 사용 또는 타격 확정 · 스펠 경기당 1회\n상성은 유리할 때 +%d%%만 적용" % [data.combat.baseStrike, data.practice.matchMana, data.block_rules.manaCap, roundi(data.combat.elementBonus * 100)])
	help_popup.dialog_text = "\n\n".join(lines)
	help_popup.popup_centered(Vector2i(350, 420 if block_index < 0 else 250))
	_refresh()

func show_preparation() -> void:
	var was_online = online_battle
	online_battle = false
	online_waiting = false
	online_event.clear()
	if was_online and online_client != null and not online_client.room_code.is_empty():
		online_client.leave_room()
	_cancel_reshape()
	result_popup.hide()
	presentation.cancel()
	after_presentation = Callable()
	shown_fighters.clear()
	phase = "idle"
	in_battle = false
	if gallery != null:
		gallery.hide()
	_apply_pending_content()
	paused = false
	ai_delay = 0.0
	preparation.show()
	arena.hide()
	back_button.hide()
	pause_button.disabled = true
	puzzle.set_interactive(false)
	audio.set_suspended(not window_active or not host_visible)
	audio.music("menu")
	if live != null:
		live.refresh()
	_qa_snapshot.call_deferred()

func start_match() -> void:
	_apply_pending_content()
	_refresh_preparation_art()
	if preparation.get_node("Start").disabled:
		return
	online_battle = false
	battle_skins = [_skin_for(character), Catalog.skin_id(data.characters[opponent])]
	gallery.hide()
	result_popup.hide()
	presentation.cancel()
	audio.music("battle")
	after_presentation = Callable()
	shown_fighters.clear()
	presentation_trace.clear()
	var size_value: Dictionary = data.board_sizes[board_index]
	game = Battle.new(match_seed, Vector2i(size_value.cols, size_value.rows), character, opponent, spell, 0, 5, data)
	in_battle = true
	paused = false
	preparation.hide()
	arena.show()
	back_button.show()
	feedback.text = ""
	_begin_turn()

func _begin_turn() -> void:
	_cancel_reshape()
	ai_skill_done = false
	ai_spell_done = false
	seconds = game.turn_seconds
	display_actor = game.actor
	shown_fighters.clear()
	phase = "turn_intro"
	puzzle.present(game.boards[game.actor], game.dimensions, false, floori((game.turn_seconds - 0.5) * 8))
	preview.text = "기본 타격 %d · 빨강 매치로 추가 피해\n%s" % [data.combat.baseStrike, Catalog.passive_text(data.characters[game.fighters[game.actor].character])]
	after_presentation = _open_turn
	presentation.play([{"kind": "turn", "actor": game.actor, "duration": TIMING.turn,
		"title": "나의 턴" if game.actor == 0 else "AI의 턴", "subtitle": "%02d ROUND · %s" % [game.round_number, data.characters[game.fighters[game.actor].character].name]}])
	_refresh()

func _leave_current_battle() -> void:
	if online_battle and online_client != null:
		online_client.forfeit()
		await get_tree().create_timer(0.2).timeout
	show_preparation()

func _open_turn() -> void:
	phase = "player_input" if game.actor == 0 else "ai_think"
	ai_delay = TIMING.ai_think
	presentation.show_ai(game.actor == 1)
	_refresh()

func _preview_route(values: Array, steps: int) -> void:
	if game == null:
		return
	var groups = Board.find_groups(values, game.dimensions)
	if steps > 0:
		audio.cue("swap")
	var causes: PackedStringArray = []
	for group in groups:
		causes.append("%s %d개 → %s" % [data.blocks[group.color].name, group.cells.size(), data.blocks[group.color].target])
	preview.text = (" · ".join(causes) if not causes.is_empty() else "%d 이동 · 같은 퍼즐 3개 연결" % steps) + "\n예상 피해 %s · 추가 연쇄 제외" % _damage_preview(groups)

func _damage_preview(groups: Array) -> String:
	var estimate: Dictionary = game.preview_damage_range(groups)
	return "%d~%d · 치명타 포함" % [estimate.min, estimate.max] if estimate.min != estimate.max else str(estimate.min)

func _use_special(kind: String) -> void:
	if not (_player_input_allowed() or _player_action_allowed()) or puzzle.dragging:
		return
	if online_battle:
		if kind == "active" and game.can_use("active"):
			online_waiting = true
			phase = "online_wait"
			online_client.send_skill()
			_refresh()
		return
	if kind == "spell" and spell == "reshape":
		if reshape_color >= 0:
			_cancel_reshape()
		elif game.can_use("spell"):
			popup_paused = paused
			paused = true
			reshape_popup.popup_centered(Vector2i(300, 115))
		_refresh()
		return
	_activate_special(kind, _resume_player)

func _resume_player() -> void:
	shown_fighters.clear()
	if game.result != null:
		if game.stage == "action":
			_commit_turn()
		else:
			_resolution_done()
		return
	phase = "player_action" if game.stage == "action" else "player_input"
	if phase == "player_action" and not game.can_use("active") and not game.can_use("spell"):
		_commit_turn()
		return
	if phase == "player_action":
		_action_preview()
	_refresh()

func _activate_special(kind: String, next: Callable) -> void:
	var before = game.fighters.duplicate(true)
	if not game.use(kind):
		next.call()
		return
	var actor: int = game.actor
	var target = 1 - actor
	var damage: int = before[target].hp - game.fighters[target].hp
	var absorbed: int = before[target].shield - game.fighters[target].shield
	var gained: int = game.fighters[actor].shield - before[actor].shield
	var skill_name: String = data.characters[game.fighters[actor].character].skill if kind == "active" else ("강타" if game.fighters[actor].spell == "smite" else "방어막")
	if game.last_special_hit.get("critical", false):
		skill_name += " · 치명타"
	phase = "special"
	shown_fighters = before
	after_presentation = next
	var target_name = "AI" if actor == 0 else "내"
	var caption = "%s HP −%d" % [target_name, damage] if damage > 0 else ("보호막 −%d" % absorbed if absorbed > 0 else "보호막 +%d" % gained)
	if kind == "active":
		caption += " · MP −%d" % data.characters[game.fighters[actor].character].active.cost
	presentation.play([{"kind": "impact" if damage + absorbed > 0 else "effect", "duration": TIMING.special, "actor": actor, "apply_at": 0.38,
		"title": skill_name, "caption": caption, "after": game.fighters.duplicate(true), "damage": damage,
		"vfx_color": Color(data.characters[game.fighters[actor].character].color) if kind == "active" else Color("ffac62"),
		"shield_only": damage == 0, "shield_gain": gained, "absorbed": absorbed}])
	_refresh()

func _player_input_allowed() -> bool:
	return in_battle and game != null and game.result == null and game.actor == 0 and phase == "player_input" and not presentation.busy and not paused and window_active and host_visible

func _player_action_allowed() -> bool:
	return in_battle and game != null and game.result == null and game.actor == 0 and phase == "player_action" and not presentation.busy and not paused and window_active and host_visible

func _cancel_reshape() -> void:
	reshape_color = -1
	reshape_cells.clear()
	if puzzle != null:
		puzzle.targeting = false
		puzzle.targeted_cells = []
		puzzle.queue_redraw()

func _reshape_target(cell: int) -> void:
	if not _player_input_allowed() or reshape_color < 0:
		return
	if cell in reshape_cells:
		reshape_cells.erase(cell)
	else:
		reshape_cells.append(cell)
	puzzle.targeted_cells = reshape_cells.duplicate()
	preview.text = "재편 · %s · %d / 2칸" % [data.blocks[reshape_color].name, reshape_cells.size()]
	puzzle.queue_redraw()
	if reshape_cells.size() == 2:
		_apply_reshape()

func _apply_reshape() -> void:
	if online_battle:
		return
	if game.reshape(reshape_cells, reshape_color):
		audio.cue("cast")
		puzzle.present(game.boards[0], game.dimensions, true, floori((game.turn_seconds - 0.5) * 8))
		preview.text = "재편 완료 · %s %d칸" % [data.blocks[reshape_color].name, reshape_cells.size()]
	_cancel_reshape()
	_refresh()

func _confirm_turn() -> void:
	if _player_action_allowed():
		_commit_turn()
	elif _player_input_allowed():
		if reshape_color >= 0 and not reshape_cells.is_empty():
			_apply_reshape()
		else:
			finish_turn(puzzle.route.duplicate())

func finish_turn(path: Array, timed_out: bool = false) -> void:
	if online_battle:
		if not _player_input_allowed() or online_waiting:
			return
		puzzle.set_interactive(false)
		_cancel_reshape()
		online_waiting = true
		phase = "online_wait"
		online_client.send_move(path)
		feedback.text = "서버에서 퍼즐 결과를 계산하고 있습니다"
		_refresh()
		return
	if not in_battle or game.result != null or paused or presentation.busy or phase not in ["player_input", "ai_think", "ai_move"]:
		return
	puzzle.set_interactive(false)
	_cancel_reshape()
	var before = game.fighters.duplicate(true)
	var record = game.resolve_puzzle(path, timed_out)
	if record.is_empty():
		_refresh()
		return
	feedback.text = "%s 직접 %d콤보 / 전체 %d · HP +%d · MP +%d%s" % ["나" if record.actor == 0 else "AI", record.manualCombo, record.groups.size(),
		record.healing, record.manaGain, " · 자동 보정" if record.assisted else ""]
	phase = "resolving"
	display_actor = record.actor
	shown_fighters = before
	var steps: Array = []
	if record.assisted:
		steps.append({"kind": "notice", "title": "자동 매치", "subtitle": "조작 시간 종료", "duration": 0.4})
	var waves: Array = game.last_waves
	var combo_count = 0
	# Bound the visible sequence; remaining cascades still use their exact receipts.
	for index in range(mini(3, waves.size())):
		var effects: Array = game.last_effects.filter(func(effect): return effect.wave == index)
		var wave_board: Array = waves[index].before.duplicate()
		for effect in effects:
			combo_count += 1
			var matched: Array = waves[index].groups.filter(func(group): return group.color == effect.color and group.cells == effect.cells)
			steps.append({"kind": "match", "duration": TIMING.match, "combo": combo_count, "wave": index, "before": wave_board.duplicate(),
				"groups": matched, "effects": [effect], "actor": record.actor, "caption": _effect_caption([effect]), "color": effect.color})
			for cell in effect.cells:
				wave_board[cell] = -1
			if _has_hit([effect]):
				steps.append({"kind": "impact", "duration": TIMING.impact, "apply_at": 0.38, "actor": record.actor, "effects": [effect], "combo": combo_count,
					"shield_only": effect.damage == 0})
			elif effect.color >= 3:
				steps.append({"kind": "restore", "duration": TIMING.restore, "apply_at": 0.42, "actor": record.actor, "effects": [effect],
					"caption": _effect_caption([effect]), "color": effect.color, "combo": combo_count})
		steps.append({"kind": "drop", "duration": TIMING.drop, "wave_data": waves[index]})
	if waves.size() > 3:
		var remaining = game.last_effects.filter(func(effect): return effect.wave >= 3)
		steps.append({"kind": "match", "duration": 0.4, "combo": combo_count + remaining.size(), "effects": remaining, "actor": record.actor,
			"before": game.boards[record.actor], "groups": [], "wave": 3})
		if _has_hit(remaining):
			steps.append({"kind": "impact", "duration": TIMING.impact, "apply_at": 0.38, "actor": record.actor, "effects": remaining, "shield_only": _effect_sum(remaining, "damage") == 0})
		if remaining.any(func(effect): return effect.color >= 3):
			steps.append({"kind": "restore", "duration": TIMING.restore, "actor": record.actor, "effects": remaining.filter(func(effect): return effect.color >= 3), "color": 4 if _effect_sum(remaining, "healed") > 0 else 3})
	if steps.is_empty():
		steps.append({"kind": "notice", "title": "기본 타격 준비", "subtitle": "매치 추가 피해 없음", "duration": 0.25})
	after_presentation = _matches_done
	presentation.play(steps)
	_refresh()

func _matches_done() -> void:
	shown_fighters.clear()
	puzzle.present(game.boards[game.actor], game.dimensions, false, 0)
	if game.actor == 1:
		_ai_action()
		return
	action_seconds = float(data.combat.actionSeconds)
	phase = "player_action"
	_action_preview()
	if not game.can_use("active") and (not game.can_use("spell") or spell == "reshape"):
		_commit_turn()
	else:
		_refresh()

func _action_preview() -> void:
	preview.text = "직접 %d콤보 · 타격 예상 %s\n스킬 %s · MP %d / %d" % [game.pending.manualCombo, _damage_preview(game.pending.groups), "준비 완료" if game.can_use("active") else "대기", game.fighters[0].mana, data.characters[character].active.cost]

func _ai_action() -> void:
	phase = "ai_action"
	shown_fighters.clear()
	if game.result == null and not ai_skill_done and game.ai_intent.active and game.can_use("active"):
		ai_skill_done = true
		_activate_special("active", _ai_action)
	elif game.result == null and not ai_spell_done and game.ai_intent.spell and game.can_use("spell"):
		ai_spell_done = true
		_activate_special("spell", _ai_action)
	else:
		_commit_turn()

func _commit_turn() -> void:
	if game == null or game.stage != "action" or presentation.busy:
		return
	if online_battle:
		if game.actor != 0 or online_waiting:
			return
		online_waiting = true
		phase = "online_wait"
		online_client.send_commit()
		feedback.text = "서버에서 타격 판정을 처리하고 있습니다"
		_refresh()
		return
	shown_fighters = game.fighters.duplicate(true)
	var already_over: bool = game.result != null
	var record = game.commit_turn()
	if record.is_empty():
		return
	display_actor = record.actor
	phase = "resolving"
	if already_over:
		_resolution_done()
		return
	var strike: Dictionary = record.strike
	var after = shown_fighters.duplicate(true)
	after[1 - record.actor].hp -= strike.damage
	after[1 - record.actor].shield -= strike.shield
	after[1 - record.actor].burn += strike.burn
	var caption = "HP −%d%s%s" % [strike.damage, " · 보호막 −%d" % strike.shield if strike.shield > 0 else "", " · 화상 +%d" % strike.burn if strike.burn > 0 else ""]
	var title = "콤보 타격" if strike.comboActive else "기본 타격"
	if strike.critical:
		title += " · 치명타"
	var steps: Array = [{"kind": "impact", "duration": TIMING.impact, "apply_at": 0.38, "actor": record.actor,
		"title": title, "caption": caption, "after": after, "damage": strike.damage,
		"vfx_color": Color(data.characters[game.fighters[record.actor].character].color), "shield_only": strike.damage == 0, "shield_gain": 0, "absorbed": strike.shield}]
	for effect in game.last_round_effects:
		steps.append({"kind": "burn", "duration": 0.32, "effect": effect})
	feedback.text += " · 타격 %d" % strike.damage
	after_presentation = _resolution_done
	presentation.play(steps)
	_refresh()

func _resolution_done() -> void:
	shown_fighters.clear()
	if game.result != null:
		_refresh()
		_show_result()
	else:
		_begin_turn()

func _effect_sum(effects: Array, key: String) -> float:
	var total = 0.0
	for effect in effects:
		total += effect.get(key, 0)
	return total

func _has_hit(effects: Array) -> bool:
	return _effect_sum(effects, "damage") + _effect_sum(effects, "shield") > 0

func _effect_caption(effects: Array) -> String:
	var lines: Array = []
	var actor: int = effects[0].actor if not effects.is_empty() else display_actor
	var own = "내" if actor == 0 else "AI"
	var enemy = "AI" if actor == 0 else "내"
	for color in range(data.blocks.size()):
		var group: Array = effects.filter(func(effect): return effect.color == color)
		if group.is_empty():
			continue
		match color:
			0:
				lines.append("빨강 → 마지막 타격 +%d" % int(_effect_sum(group, "attackBonus")))
			1:
				var denied = int(_effect_sum(group, "denied"))
				lines.append("번개 → %s MP −%d" % [enemy, denied] if denied > 0 else ("번개 → %s MP 없음" % enemy if group[0].enemyManaBefore == 0 else "번개 → 차감 한도"))
			2:
				var bonus = _effect_sum(group, "green")
				lines.append("질풍 → %s 다음 공격 +%s%%" % [own, String.num(bonus * 100, 1).trim_suffix(".0")] if bonus > 0.00001 else "질풍 → 강화 한도")
			3:
				var bonus = int(_effect_sum(group, "mana"))
				lines.append("마나 → %s MP +%d" % [own, bonus] if bonus > 0 else ("마나 → MP 가득 참" if group[0].manaFull else "마나 → 충전 한도"))
			4:
				var healed = int(_effect_sum(group, "healed"))
				lines.append("황금 치유 → %s HP +%d" % [own, healed] if healed > 0 else ("황금 치유 → HP 가득 참" if group[0].hpFull else "황금 치유 → 회복 한도"))
	var output: PackedStringArray = []
	for index in range(0, lines.size(), 2):
		output.append(lines[index] + (" · " + lines[index + 1] if index + 1 < lines.size() else ""))
	return "\n".join(output)

func _presentation_step(step: Dictionary) -> void:
	if step.kind == "turn":
		audio.cue("turn", 1.08 if step.actor == 0 else 0.9)
	elif step.kind == "drop":
		audio.cue("drop")
	elif step.kind == "ai_move":
		audio.cue("swap")
	if step.has("after"):
		audio.cue("cast")
	match String(step.kind):
		"match":
			puzzle.present(step.before, game.dimensions, false, 0)
			puzzle.play_effect("clear", {"groups": step.groups})
			preview.text = _effect_caption(step.effects)
			phase_label.text = "%s · %d콤보" % ["연쇄 매치" if step.wave > 0 else "퍼즐 매치", step.effects.size()]
		"drop":
			puzzle.present(step.wave_data.after, game.dimensions, false, 0)
			puzzle.play_effect("fall", step.wave_data)
		"ai_move":
			puzzle.play_effect("ai", {"path": ai_path})
		"impact", "effect", "restore":
			if not step.has("after") and puzzle.visual_mode == "clear":
				puzzle.visual_progress = 1.0
				puzzle.queue_redraw()
			if step.has("after"):
				preview.text = step.title + "\n" + step.caption
			elif step.kind == "restore":
				preview.text = _effect_caption(step.effects)
		"burn": preview.text = "%s · 화상 HP −%d" % ["나" if step.effect.actor == 0 else "AI", step.effect.damage]
	if web_qa:
		presentation_trace.append({"kind": step.kind, "actor": step.get("actor", display_actor), "caption": preview.text})
		if presentation_trace.size() > 48:
			presentation_trace.pop_front()
	_qa_snapshot.call_deferred()

func _presentation_apply(step: Dictionary) -> void:
	if step.kind == "impact":
		audio.cue("shield" if step.get("shield_only", false) else "hit")
	elif step.kind == "effect":
		audio.cue("shield")
	elif step.kind == "restore":
		audio.cue("green" if step.color == 4 else "mana")
	elif step.kind == "burn":
		audio.cue("red", 0.85)
	elif step.kind == "match":
		var colors = {}
		for effect in step.effects:
			colors[int(effect.color)] = true
		for color in colors:
			audio.cue(["red", "blue", "green", "mana", "green"][color], 1 + mini(step.wave, 3) * 0.035)
	if step.has("after"):
		shown_fighters = step.after.duplicate(true)
		var target: int = 1 - step.actor if step.damage + step.absorbed > 0 else step.actor
		presentation.floating("HP −%d" % step.damage if step.damage > 0 else ("보호막 −%d" % step.absorbed if step.absorbed > 0 else "보호막 +%d" % step.shield_gain), target, ACCENT)
	elif step.kind in ["match", "impact", "restore"]:
		for effect in step.effects:
			var actor: int = effect.actor
			var target = 1 - actor
			if step.kind == "match":
				if effect.color < 3:
					shown_fighters[actor].mana += effect.mana
				shown_fighters[target].mana -= effect.denied
				shown_fighters[actor].nextGreen += effect.green
			elif step.kind == "restore":
				shown_fighters[actor].mana += effect.mana
				shown_fighters[actor].hp += effect.healed
			else:
				shown_fighters[target].hp -= effect.damage
				shown_fighters[target].shield -= effect.shield
				shown_fighters[target].burn += effect.burn
		if step.kind == "impact":
			var damage = int(_effect_sum(step.effects, "damage"))
			var shield = int(_effect_sum(step.effects, "shield"))
			presentation.floating("HP −%d" % damage if damage > 0 else "보호막 −%d" % shield, 1 - step.actor, Color("ffb3ab") if damage > 0 else Color("6bbce0"))
		elif step.kind == "restore":
			var healed = int(_effect_sum(step.effects, "healed"))
			var mana = int(_effect_sum(step.effects, "mana"))
			presentation.floating("HP +%d" % healed if healed > 0 else ("MP +%d" % mana if mana > 0 else "HP 최대" if step.color == 4 else "MP 최대"), step.actor, PuzzleBoard.COLORS[step.color])
		elif _effect_sum(step.effects.filter(func(effect): return effect.color < 3), "mana") > 0:
			presentation.floating("MP +%d" % int(_effect_sum(step.effects, "mana")), step.actor, Color("ad8bd1"))
	elif step.kind == "burn":
		shown_fighters[step.effect.actor].hp -= step.effect.damage
		presentation.floating("화상 −%d" % step.effect.damage, step.effect.actor, Color("ef6972"))
	_refresh()

func _start_ai_move() -> void:
	shown_fighters.clear()
	ai_path = Board.simple_match(game.boards[1], game.dimensions, game.seed_value ^ (game.round_number * 0x9e3779b1))
	phase = "ai_move"
	after_presentation = func(): finish_turn(ai_path)
	presentation.play([{"kind": "ai_move", "duration": TIMING.ai_move}])
	_refresh()

func _refresh() -> void:
	audio.set_suspended(not window_active or not host_visible or (paused and phase != "result" and not sound_popup.visible))
	if not in_battle or game == null:
		_qa_snapshot.call_deferred()
		return
	presentation.set_suspended(paused)
	for side in range(2):
		var unit: Dictionary = game.fighters[side] if shown_fighters.is_empty() else shown_fighters[side]
		var info: Dictionary = data.characters[unit.character]
		var meter: Dictionary = meters[side]
		meter.portrait.texture = Catalog.portrait(info, battle_skins[side])
		meter.portrait.tooltip_text = Catalog.stats_text(info, unit.stats) + "\n" + Catalog.passive_text(info) + "\n" + Catalog.active_text(info, unit.stats)
		meter.name.text = ("나\n" if side == 0 else ("상대\n" if online_battle else "AI\n")) + info.name
		meter.hpLabel.text = "%d" % unit.hp
		meter.hp.max_value = unit.maxHp
		meter.hp.value = unit.hp
		meter.hp.add_theme_stylebox_override("fill", _box(TEXT if side == 0 else Color("ff6d65"), Color.TRANSPARENT, 0))
		meter.hpLabel.tooltip_text = "HP %d / %d" % [unit.hp, unit.maxHp]
		meter.mpLabel.text = "MP %d" % unit.mana
		meter.mp.value = unit.mana
		meter.mp.add_theme_stylebox_override("fill", _box(Color("71d9ec"), Color.TRANSPARENT, 0))
		var states: PackedStringArray = []
		if unit.shield > 0:
			states.append("보호막 %d" % unit.shield)
		if unit.burn > 0:
			states.append("화상 %d" % unit.burn)
		if unit.silenceTurns > 0:
			states.append("침묵")
		if unit.nextGreen + unit.nextBoost > 0:
			states.append("다음 +%s%%" % String.num((unit.nextGreen + unit.nextBoost) * 100, 1).trim_suffix(".0"))
		meter.statuses.text = " · ".join(states) if not states.is_empty() else "상태 없음"
		meter.statuses.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	for index in range(legend_buttons.size()):
		legend_buttons[index].modulate = Color.WHITE if presentation.current.get("color", -1) == index or not presentation.busy else Color("a5aab3")
	phase_label.text = "일시 정지" if paused else ("서버 판정 중" if phase == "online_wait" else ("효과 적용 중" if phase in ["resolving", "special"] else ("상대 조작 중" if online_battle and display_actor == 1 else ("AI 조작 중" if phase in ["ai_think", "ai_move"] else ("나의 턴" if display_actor == 0 else "AI의 턴")))))
	if phase == "player_action" and not paused:
		phase_label.text = "스킬 선택 · 타격 대기"
	if not paused and phase == "resolving" and presentation.current.has("effects"):
		phase_label.text = "%d콤보 · 효과 적용" % presentation.current.effects.size()
	phase_label.add_theme_color_override("font_color", Color("ff7a70") if display_actor == 1 else TEXT)
	timer_label.text = "%0.1f" % (action_seconds if game.stage == "action" else seconds) if online_battle else ("AI" if display_actor == 1 else "%0.1f" % (action_seconds if game.stage == "action" else seconds))
	clock.value = action_seconds / data.combat.actionSeconds * 100.0 if game.stage == "action" else seconds / game.turn_seconds * 100.0
	var enemy: Dictionary = game.fighters[1]
	var enemy_skill: Dictionary = data.characters[enemy.character].active
	var intent_text = "행동 선택 중" if online_battle else ("스킬 준비" if game.ai_intent.active else "기본 타격 · MP 보유")
	if game.ai_intent.active and (enemy.mana < enemy_skill.cost or enemy.silenceTurns > 0):
		intent_text = "스킬 차단 · 기본 타격"
	if display_actor == 1 and ai_skill_done:
		intent_text = "스킬 사용 · 타격 준비"
	enemy_intent.text = "%s  %s  |  MP %d / %d" % ["상대 상태" if online_battle else "AI 예고", intent_text, enemy.mana, enemy_skill.cost]
	enemy_intent.tooltip_text = Catalog.active_text(data.characters[enemy.character], enemy.stats)
	round_label.text = "%02d / %02d R" % [game.round_number, data.game_limits.rounds]
	pause_button.disabled = online_battle or (game.result != null and not presentation.busy)
	pause_button.icon = load("res://assets/icons/" + ("play" if paused else "pause") + ".svg")
	var own_info: Dictionary = data.characters[character]
	var skill_state = "매칭 후"
	if game.actor == 0 and game.stage == "action":
		skill_state = "사용 가능" if game.can_use("active") else "침묵" if game.fighters[0].silenceTurns > 0 else "MP 부족"
	active_button.text = "%s\nMP %d · %s" % [own_info.skill, own_info.active.cost, skill_state]
	active_button.tooltip_text = Catalog.active_text(own_info, game.fighters[0].stats) + (" · 침묵" if game.fighters[0].silenceTurns > 0 else "")
	spell_button.text = "온라인 스펠 준비 중" if online_battle else ("취소" if reshape_color >= 0 else {"smite": "강타", "barrier": "방어막", "reshape": "재편"}[spell])
	spell_button.icon = load("res://assets/icons/" + {"smite": "swords", "barrier": "shield", "reshape": "sparkles"}[spell] + ".svg")
	spell_button.tooltip_text = "온라인 규칙에는 다음 버전에서 적용됩니다" if online_battle else "경기당 1회 · " + ("사용 완료" if game.fighters[0].spellUsed else "준비 완료")
	var allowed = _player_input_allowed()
	var action_allowed = _player_action_allowed()
	active_button.disabled = not action_allowed or not game.can_use("active")
	spell_button.disabled = online_battle or not (allowed or action_allowed) or puzzle.dragging or not game.can_use("spell")
	end_button.disabled = not (allowed or action_allowed)
	end_button.tooltip_text = "타격 확정 · MP 보유" if action_allowed else "매칭 확정"
	puzzle.set_interactive(allowed)
	_qa_snapshot.call_deferred()

func _qa_snapshot() -> void:
	if not web_qa:
		return
	await get_tree().process_frame
	var controls = {"start": preparation.get_node("Start"), "pause": pause_button, "end": end_button,
		"spell": spell_button, "active": active_button, "board": puzzle, "header": $SafeArea/Layout/Header, "body": $SafeArea/Layout/Body,
		"player_art": meters[0].portrait, "enemy_art": meters[1].portrait, "result_art": result_art, "rematch": result_rematch, "change": result_change,
		"sound": sound_button, "mute": mute_switch, "music_volume": music_slider, "sfx_volume": sfx_slider, "gallery": gallery_button,
		"back": back_button, "leave_confirm": leave_popup.get_ok_button()}
	if online_create_button != null:
		controls.merge({"online_create": online_create_button, "online_code": online_code, "online_join": online_join_button,
			"online_ready": online_ready_button, "online_leave": online_leave_button, "online_room": online_room_label})
	if gallery.visible:
		controls["skin_apply"] = gallery.apply_button
		controls["gallery_art"] = gallery.hero
		controls["gallery_close"] = gallery.close_button
	var rects = {}
	for key in controls:
		var rect: Rect2 = controls[key].get_global_rect()
		if key in ["mute", "music_volume", "sfx_volume"]:
			rect.position += Vector2(sound_popup.position)
		elif key == "leave_confirm":
			rect.position += Vector2(leave_popup.position)
		rects[key] = {"x": rect.position.x, "y": rect.position.y, "width": rect.size.x, "height": rect.size.y}
	var snapshot = {"screen": "battle" if in_battle else "gallery" if gallery.visible else "prepare", "paused": paused, "rects": rects, "characters": character_ids,
		"content_revision": data.get("content_revision", "bundled"), "content_pending": not pending_content.is_empty(), "content_status": content_status,
		"selected_skins": skin_choices, "battle_skins": battle_skins, "gallery": gallery.diagnostics() if gallery.visible else {},
		"selected_character": character, "selected_skin": _skin_for(character),
		"phase": phase, "presentation_busy": presentation.busy, "presentation_step": presentation.current.get("kind", ""),
		"presentation_progress": presentation._progress(),
		"presentation_color": presentation.current.get("color", -1),
		"cutin_scale": presentation.hero_source.size.y / maxf(1, meters[0].portrait.size.y) if presentation.hero_source.visible else presentation.hero_restore.size.y / maxf(1, meters[0].portrait.size.y) if presentation.hero_restore.visible else 1.0,
		"effect_caption": preview.text, "board_visual": puzzle.visual_mode, "visual_style": "tactical-v2",
		"vfx_texture": presentation.FX.ATLAS.get_size(),
		"presentation_trace": presentation_trace.duplicate(true),
		"host_visible": host_visible, "seconds": seconds, "help_visible": help_popup.visible,
		"leave_visible": leave_popup.visible, "exit_visible": exit_popup.visible,
		"sound_visible": sound_popup.visible, "result_visible": result_popup.visible, "palette": data.blocks.size(),
		"result_title": result_title.text,
		"viewport": {"width": size.x, "height": size.y}}
	if online_client != null:
		var online_players: Array = online_client.room_state.get("players", [])
		snapshot["online"] = {"status": online_status.text if online_status != null else "",
			"authenticated": online_client.authenticated, "connected": online_client.connected,
			"room_code": online_client.room_code, "phase": String(online_client.room_state.get("phase", "")),
			"player_count": online_players.size(), "players": online_players}
	if in_battle and game != null:
		snapshot.merge({"round": game.round_number, "actor": game.actor, "records": game.records.size(),
			"attack_stats": [game.fighters[0].stats.attack, game.fighters[1].stats.attack],
			"combat_stage": game.stage, "pending": game.pending, "intent": game.ai_intent, "action_seconds": action_seconds,
			"hp": [game.fighters[0].hp, game.fighters[1].hp], "result": game.result,
			"spell_used": game.fighters[0].spellUsed, "board": game.boards[game.actor], "mp": [game.fighters[0].mana, game.fighters[1].mana],
			"active_uses": game.fighters[0].activeUses, "active_enabled": not active_button.disabled})
		snapshot["moves"] = []
		if phase == "player_input" and not paused and not presentation.busy:
			var values: Array = game.boards[0]
			for cell in range(values.size()):
				for candidate in Board.neighbors(cell, game.dimensions):
					if candidate <= cell or values[cell] == values[candidate]:
						continue
					var groups = Board.find_groups(Board.moved(values, cell, candidate), game.dimensions)
					if not groups.is_empty():
						snapshot.moves.append({"path": [cell, candidate], "colors": groups.map(func(group): return group.color)})
		if not game.records.is_empty():
			snapshot["last_healing"] = game.records.back().healing
			snapshot["last_actor"] = game.records.back().actor
			snapshot["last_strike"] = game.records.back().strike
			snapshot["last_damage"] = game.records.back().damage
	if web_host != null:
		web_host.publishDiagnostics(JSON.stringify(snapshot))

func _show_result() -> void:
	presentation.cancel()
	phase = "result"
	paused = true
	audio.music("menu")
	audio.cue("victory" if game.result == "player" else "defeat")
	puzzle.present(game.boards[game.actor], game.dimensions, false, 0)
	result_title.text = "VICTORY · 승리" if game.result == "player" else ("DEFEAT · 패배" if game.result == "ai" else "DRAW · 무승부")
	result_title.add_theme_color_override("font_color", ACCENT if game.result == "player" else Color("ff9caa") if game.result == "ai" else TEXT)
	result_art.texture = Catalog.portrait(data.characters[character], battle_skins[0])
	result_art.modulate = Color.WHITE if game.result != "ai" else Color("b5bdcc")
	result_name.text = data.characters[character].name
	result_label.text = "%02d ROUND · %d TURN\n%s  HP %d   :   %s  HP %d\n누적 피해 %d · 최대 %d콤보 · 스킬 %d회" % [game.round_number, game.records.size(), data.characters[character].name, game.fighters[0].hp,
		data.characters[opponent].name, game.fighters[1].hp, game.fighters[0].damage, game.fighters[0].maxCombo, game.fighters[0].activeUses]
	result_popup.show()
	_qa_snapshot.call_deferred()

func _process(delta: float) -> void:
	if live != null:
		live.foreground = window_active and host_visible
	if web_qa:
		qa_elapsed += delta
		if qa_elapsed >= 0.1:
			qa_elapsed = 0
			_qa_snapshot.call_deferred()
	audio.set_suspended(not window_active or not host_visible or (paused and phase != "result" and not sound_popup.visible))
	if not in_battle or game == null or paused or not window_active or not host_visible:
		return
	var step_delta = minf(delta, 0.1)
	var was_busy: bool = presentation.busy
	presentation.advance(step_delta)
	if presentation.busy and presentation.current.kind in ["match", "drop", "ai_move"]:
		puzzle.visual_progress = clampf(presentation.elapsed / presentation.current.duration, 0, 1)
		puzzle.queue_redraw()
	if online_battle:
		var remaining = maxf(0.0, float(game.turn_deadline) / 1000.0 - Time.get_unix_time_from_system())
		if game.stage == "action":
			action_seconds = remaining
			timer_label.text = "%0.1f" % action_seconds
			clock.value = action_seconds / maxf(0.1, float(data.combat.actionSeconds)) * 100.0
		else:
			seconds = remaining
			timer_label.text = "%0.1f" % seconds
			clock.value = seconds / maxf(0.1, game.turn_seconds) * 100.0
		return
	if was_busy or game.result != null:
		return
	if phase == "ai_think":
		ai_delay -= step_delta
		if ai_delay <= 0:
			_start_ai_move()
		return
	if phase == "player_action":
		action_seconds = maxf(0, action_seconds - step_delta)
		timer_label.text = "%0.1f" % action_seconds
		clock.value = action_seconds / data.combat.actionSeconds * 100.0
		if action_seconds <= 0:
			_commit_turn()
		return
	if phase != "player_input":
		return
	seconds = maxf(0, seconds - step_delta)
	timer_label.text = "%0.1f" % seconds
	clock.value = seconds / game.turn_seconds * 100.0
	if seconds <= 0:
		finish_turn(puzzle.route.duplicate(), true)

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		window_active = false
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		window_active = true

func _safe_area() -> void:
	# Web host insets are already applied to the canvas by the HTML shell.
	if OS.has_feature("web") or not OS.has_feature("mobile"):
		return
	var safe = DisplayServer.get_display_safe_area()
	var screen = DisplayServer.screen_get_size()
	if safe.size.x <= 0 or safe.size.y <= 0 or screen.x <= 0 or screen.y <= 0:
		return
	var scale_factor = get_viewport_rect().size / Vector2(screen)
	var margins = {"left": safe.position.x, "top": safe.position.y, "right": screen.x - safe.end.x, "bottom": screen.y - safe.end.y}
	for side in margins:
		var factor = scale_factor.x if side in ["left", "right"] else scale_factor.y
		$SafeArea.add_theme_constant_override("margin_" + side, roundi(margins[side] * factor))

func _smoke() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	assert(preparation.visible and not arena.visible)
	character = character_ids.back()
	opponent = character_ids[0]
	spell = "barrier"
	start_match()
	_smoke_settle()
	_use_special("spell")
	assert(game.fighters[0].shield == 150)
	_smoke_settle()
	finish_turn(Board.simple_match(game.boards[0], game.dimensions))
	_smoke_settle()
	assert(game.actor == 1 or game.result != null)
	if game.result == null:
		finish_turn(Board.simple_match(game.boards[1], game.dimensions))
		_smoke_settle()
		assert(game.result != null or (game.round_number == 2 and game.actor == 0))
	while game.result == null:
		finish_turn(Board.simple_match(game.boards[game.actor], game.dimensions))
		_smoke_settle()
	assert(result_popup.visible)
	result_popup.hide()
	show_preparation()
	assert(preparation.visible and character == character_ids.back() and spell == "barrier")
	print("GODOT_UI_SMOKE_OK: enabled catalog -> Barrier -> shield 150 -> staged matching/strike -> full match -> retained preparation")
	get_tree().quit()

func _smoke_settle() -> void:
	for _step in range(300):
		if presentation.busy:
			presentation.advance(10)
		elif phase == "player_action":
			_commit_turn()
		else:
			break

func _capture() -> void:
	for _index in range(5):
		await RenderingServer.frame_post_draw
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://artifacts"))
	get_viewport().get_texture().get_image().save_png("res://artifacts/native-prepare.png")
	start_match()
	paused = true
	_refresh()
	for _index in range(5):
		await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://artifacts/native-battle.png")
	get_tree().quit()
