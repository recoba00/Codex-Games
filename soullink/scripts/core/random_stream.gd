class_name SoulRandom
extends RefCounted

var state: int

func _init(seed_value: int = 1) -> void:
	state = seed_value & 0xffffffff
	if state == 0:
		state = 0x9e3779b9

func next() -> float:
	var value = state
	value ^= (value << 13) & 0xffffffff
	value ^= value >> 17
	value ^= (value << 5) & 0xffffffff
	state = value & 0xffffffff
	return float(state) / 4294967296.0

func int_below(maximum: int) -> int:
	return floori(next() * maximum)

func shuffle(values: Array) -> Array:
	for index in range(values.size() - 1, 0, -1):
		var other = int_below(index + 1)
		var value = values[index]
		values[index] = values[other]
		values[other] = value
	return values
