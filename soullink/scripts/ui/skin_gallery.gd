extends VBoxContainer

signal closed
signal skin_selected(character_id: String, skin: String)
signal image_needed(image: String)

const Catalog = preload("res://scripts/core/catalog.gd")
const Portrait = preload("res://scripts/ui/portrait.gd")
var data: Dictionary = {}
var choices: Dictionary = {}
var character_id = ""
var preview_skin = ""
var character_choice: OptionButton
var hero: TextureRect
var title: Label
var skin_title: Label
var detail: Label
var apply_button: Button
var skin_list: HBoxContainer
var tiles: Dictionary = {}
var heading: HBoxContainer
var heading_text: Label
var body: BoxContainer
var skin_scroll: ScrollContainer
var detail_scroll: ScrollContainer
var close_button: Button

func _ready() -> void:
	add_theme_constant_override("separation", 12)
	heading = HBoxContainer.new()
	heading_text = Label.new()
	heading_text.text = "캐릭터 도감"
	heading_text.add_theme_font_size_override("font_size", 22)
	heading_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_child(heading_text)
	var close = Button.new()
	close_button = close
	close.icon = load("res://assets/icons/close.svg")
	close.tooltip_text = "도감 닫기"
	close.custom_minimum_size = Vector2(44, 44)
	close.add_theme_constant_override("icon_max_width", 20)
	close.expand_icon = true
	close.pressed.connect(func(): closed.emit())
	heading.add_child(close)
	add_child(heading)
	character_choice = OptionButton.new()
	character_choice.custom_minimum_size.y = 44
	character_choice.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	character_choice.item_selected.connect(func(index):
		character_id = data.characters.keys()[index]
		preview_skin = Catalog.skin_id(data.characters[character_id], choices.get(character_id, ""))
		_build_skins())
	add_child(character_choice)
	body = BoxContainer.new()
	body.vertical = true
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 12)
	add_child(body)
	hero = Portrait.new()
	hero.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	hero.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	hero.custom_minimum_size.y = 120
	hero.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hero.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(hero)
	detail_scroll = ScrollContainer.new()
	detail_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(detail_scroll)
	var details = VBoxContainer.new()
	details.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	details.add_theme_constant_override("separation", 8)
	detail_scroll.add_child(details)
	title = Label.new()
	title.add_theme_font_size_override("font_size", 20)
	details.add_child(title)
	skin_title = Label.new()
	skin_title.add_theme_color_override("font_color", Color("ffb43b"))
	skin_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	details.add_child(skin_title)
	detail = Label.new()
	detail.add_theme_font_size_override("font_size", 11)
	detail.add_theme_color_override("font_color", Color("a5aab3"))
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	details.add_child(detail)
	skin_scroll = ScrollContainer.new()
	skin_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	skin_scroll.custom_minimum_size.y = 148
	details.add_child(skin_scroll)
	skin_list = HBoxContainer.new()
	skin_list.add_theme_constant_override("separation", 8)
	skin_scroll.add_child(skin_list)
	apply_button = Button.new()
	apply_button.text = "외형 적용"
	apply_button.custom_minimum_size.y = 48
	apply_button.pressed.connect(func():
		choices[character_id] = preview_skin
		skin_selected.emit(character_id, preview_skin)
		_refresh_preview())
	add_child(apply_button)
	resized.connect(_responsive)
	_responsive.call_deferred()
	hide()

func _responsive() -> void:
	var wide = size.x > size.y * 1.3
	body.vertical = not wide
	detail_scroll.custom_minimum_size.y = 0 if wide else 264
	detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL if wide else Control.SIZE_SHRINK_END
	hero.custom_minimum_size.y = 80 if size.y < 550 else 120
	skin_scroll.custom_minimum_size.y = 80 if wide else 148
	heading_text.visible = not wide
	if wide and character_choice.get_parent() != heading:
		character_choice.reparent(heading)
		heading.move_child(character_choice, 1)
	elif not wide and character_choice.get_parent() != self:
		character_choice.reparent(self)
		move_child(character_choice, 1)
	for tile in tiles.values():
		tile.button.custom_minimum_size.y = 64 if wide else 132

func configure(next: Dictionary, selected: Dictionary, preferred: String = "") -> void:
	data = next
	choices = selected.duplicate()
	if not preferred.is_empty():
		character_id = preferred
	if not data.characters.has(character_id):
		character_id = data.characters.keys()[0]
	var ids: Array = data.characters.keys()
	character_choice.clear()
	for id in ids:
		character_choice.add_item(data.characters[id].name)
	character_choice.selected = ids.find(character_id)
	preview_skin = Catalog.skin_id(data.characters[character_id], choices.get(character_id, ""))
	_build_skins()

func _build_skins() -> void:
	for child in skin_list.get_children():
		skin_list.remove_child(child)
		child.queue_free()
	tiles.clear()
	var info: Dictionary = data.characters[character_id]
	for id in info.skins:
		var skin: Dictionary = info.skins[id]
		if not skin.enabled:
			continue
		var button = Button.new()
		button.custom_minimum_size = Vector2(104, 132)
		button.tooltip_text = info.name + " · " + skin.name
		var column = VBoxContainer.new()
		column.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(column)
		column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		column.offset_left = 6
		column.offset_right = -6
		column.offset_top = 6
		column.offset_bottom = -6
		var art = Portrait.new()
		art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		art.size_flags_vertical = Control.SIZE_EXPAND_FILL
		column.add_child(art)
		var label = Label.new()
		label.text = skin.name
		label.add_theme_font_size_override("font_size", 11)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		column.add_child(label)
		button.pressed.connect(func():
			preview_skin = id
			_refresh_preview())
		skin_list.add_child(button)
		tiles[id] = {"button": button, "art": art}
		image_needed.emit(skin.image)
	_refresh_preview()
	_responsive()

func refresh_images() -> void:
	if data.is_empty():
		return
	var info: Dictionary = data.characters[character_id]
	for id in tiles:
		tiles[id].art.texture = Catalog.portrait(info, id)
	_refresh_preview()

func _refresh_preview() -> void:
	var info: Dictionary = data.characters[character_id]
	preview_skin = Catalog.skin_id(info, preview_skin)
	title.text = info.name
	skin_title.text = info.skins[preview_skin].name
	detail.text = info.role + " · " + info.skill
	hero.texture = Catalog.portrait(info, preview_skin)
	var equipped = Catalog.skin_id(info, choices.get(character_id, "")) == preview_skin
	apply_button.text = "적용 중" if equipped else "이미지 불러오는 중" if hero.texture == null else "외형 적용"
	apply_button.disabled = equipped or hero.texture == null
	for id in tiles:
		tiles[id].button.modulate = Color.WHITE if id == preview_skin else Color("858a94")
		if tiles[id].art.texture == null:
			tiles[id].art.texture = Catalog.portrait(info, id)
	image_needed.emit(Catalog.image_id(info, preview_skin))

func diagnostics() -> Dictionary:
	var skin_ids: Array = tiles.keys()
	var rects: Dictionary = {}
	for id in tiles:
		var rect: Rect2 = tiles[id].button.get_global_rect()
		rects[id] = {"x": rect.position.x, "y": rect.position.y, "width": rect.size.x, "height": rect.size.y}
	return {"character": character_id, "skin": preview_skin, "skins": skin_ids, "tiles": rects, "image_loaded": hero.texture != null}

func image_ids() -> Array:
	if data.is_empty() or not data.characters.has(character_id):
		return []
	return data.characters[character_id].skins.values().map(func(skin): return skin.image)
