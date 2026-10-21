extends SceneTree

const Main = preload("res://scenes/main.tscn")
var app: Control

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	app = Main.instantiate()
	root.add_child(app)
	await create_timer(0.2).timeout
	app.window_active = true
	app.audio.persist = false
	app.audio.configure(0.35, 0.75, false)
	assert(app.audio.music_player.playing and app.audio.current_music == "menu")
	assert(app.audio.music_player.stream.get_length() > 80)
	app.start_match()
	app._smoke_settle()
	await create_timer(0.3).timeout
	assert(app.audio.current_music == "battle")
	assert(app.audio.music_player.stream.loop)
	assert(app.audio.music_player.stream.get_length() > 107 and app.audio.music_player.stream.get_length() < 108)
	app._use_special("spell")
	app._smoke_settle()
	assert(app.audio.played.get("cast", 0) > 0 and app.audio.played.get("hit", 0) > 0)
	app.host_visible = false
	await process_frame
	await process_frame
	assert(app.audio.suspended and app.audio.music_player.stream_paused)
	for player in app.audio.voices:
		assert(not player.playing)
	app.host_visible = true
	await process_frame
	await process_frame
	assert(not app.audio.suspended and not app.audio.music_player.stream_paused)
	app.sound_button.pressed.emit()
	await process_frame
	app.music_slider.value = 25
	app.sfx_slider.value = 60
	app.mute_switch.button_pressed = true
	assert(app.paused and app.audio.muted and app.audio.music_player.stream_paused)
	assert(is_equal_approx(app.audio.music_volume, 0.25) and is_equal_approx(app.audio.sfx_volume, 0.6))
	for _index in range(3):
		await RenderingServer.frame_post_draw
	assert(root.get_texture().get_image().save_png("res://artifacts/audio-settings.png") == OK)
	app.mute_switch.button_pressed = false
	app.sound_popup.hide()
	app.audio.configure(0.35, 0.75, false)
	assert(not app.paused and not app.audio.muted)
	var report = {"passed": true, "music": 2, "effects": app.audio.streams.size(), "nativeDriver": AudioServer.get_driver_name(),
		"backgroundStopsVoices": true, "muteAndSliders": true, "physicalDevice": false}
	var file = FileAccess.open("res://artifacts/audio-native-report.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t"))
	print("GODOT_AUDIO_OK " + JSON.stringify(report))
	app.audio.music_player.stop()
	for player in app.audio.voices:
		player.stop()
	app.queue_free()
	app = null
	await create_timer(0.1).timeout
	quit()
