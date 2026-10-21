extends Node

var catalog: Dictionary
var music_volume = 0.35
var sfx_volume = 0.75
var muted = false
var suspended = false
var persist = true
var current_music = ""
var web_audio
var music_player: AudioStreamPlayer
var voices: Array[AudioStreamPlayer] = []
var streams: Dictionary = {}
var last: Dictionary = {}
var played: Dictionary = {}
var duck = 0.0
var save_delay = 0.0

func _ready() -> void:
	catalog = JSON.parse_string(FileAccess.get_file_as_string("res://data/audio.json"))
	var settings = ConfigFile.new()
	if settings.load("user://audio.cfg") == OK:
		music_volume = clampf(float(settings.get_value("audio", "music", 0.35)), 0, 1)
		sfx_volume = clampf(float(settings.get_value("audio", "sfx", 0.75)), 0, 1)
		muted = bool(settings.get_value("audio", "muted", false))
	if OS.has_feature("web"):
		web_audio = JavaScriptBridge.get_interface("SoulLinkAudio")
		if web_audio != null:
			web_audio.setCatalog(JSON.stringify(catalog))
			_apply_settings()
		return
	if DisplayServer.get_name() == "headless":
		return
	music_player = AudioStreamPlayer.new()
	add_child(music_player)
	for index in range(6):
		var player = AudioStreamPlayer.new()
		add_child(player)
		voices.append(player)
	for id in catalog.sfx:
		streams[id] = load("res://assets/audio/" + catalog.sfx[id].file)

func configure(music_level: float, effect_level: float, silence: bool) -> void:
	music_volume = clampf(music_level, 0, 1)
	sfx_volume = clampf(effect_level, 0, 1)
	muted = silence
	_apply_settings()
	if persist:
		save_delay = 0.35

func _save() -> void:
	var settings = ConfigFile.new()
	settings.set_value("audio", "music", music_volume)
	settings.set_value("audio", "sfx", sfx_volume)
	settings.set_value("audio", "muted", muted)
	settings.save("user://audio.cfg")

func _apply_settings() -> void:
	if web_audio != null:
		web_audio.configure(JSON.stringify({"music": music_volume, "sfx": sfx_volume, "muted": muted}))
	elif is_instance_valid(music_player):
		music_player.volume_db = linear_to_db(maxf(0.0001, music_volume * 0.8))
		music_player.stream_paused = suspended or muted or music_volume == 0
		if muted or sfx_volume == 0:
			for player in voices:
				player.stop()

func music(id: String) -> void:
	if id == current_music or not catalog.music.has(id):
		return
	current_music = id
	if web_audio != null:
		web_audio.music(id)
	elif is_instance_valid(music_player):
		var stream: AudioStreamMP3 = load("res://assets/audio/" + catalog.music[id].file)
		stream.loop = true
		music_player.stream = stream
		music_player.play()
		_apply_settings()

func cue(id: String, pitch: float = 1.0) -> void:
	if suspended or muted or sfx_volume == 0 or not catalog.sfx.has(id):
		return
	var now = Time.get_ticks_msec() / 1000.0
	var spec: Dictionary = catalog.sfx[id]
	if now - last.get(id, -100.0) < spec.cooldown:
		return
	last[id] = now
	played[id] = int(played.get(id, 0)) + 1
	if web_audio != null:
		web_audio.play(id, clampf(pitch, 0.75, 1.25))
	elif not voices.is_empty():
		var player = voices[0]
		for candidate in voices:
			if not candidate.playing:
				player = candidate
				break
		player.stream = streams[id]
		player.pitch_scale = clampf(pitch, 0.75, 1.25)
		player.volume_db = linear_to_db(maxf(0.0001, sfx_volume * spec.gain * 0.7))
		player.play()
		if spec.get("duck", false):
			duck = 0.2

func set_suspended(value: bool) -> void:
	if suspended == value:
		return
	suspended = value
	if web_audio != null:
		web_audio.suspend(value)
	else:
		_apply_settings()
		if value:
			for player in voices:
				player.stop()

func _process(delta: float) -> void:
	if save_delay > 0:
		save_delay -= delta
		if save_delay <= 0:
			_save()
	if web_audio == null and is_instance_valid(music_player) and not suspended:
		duck = maxf(0, duck - delta)
		var target = music_volume * 0.8 * (0.55 if duck > 0 else 1.0)
		var level = lerpf(db_to_linear(music_player.volume_db), maxf(0.0001, target), minf(1, delta * 16))
		music_player.volume_db = linear_to_db(level)

func _exit_tree() -> void:
	if save_delay > 0 and persist:
		_save()
	if web_audio != null:
		web_audio.dispose()
