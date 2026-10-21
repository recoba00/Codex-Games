class_name SoulRefill
extends RefCounted

const RandomStream = preload("res://scripts/core/random_stream.gd")
const Board = preload("res://scripts/core/board.gd")
var bag: Array = []
var random: RefCounted
var colors: int

func _init(seed_value: int = 1, color_count: int = 5) -> void:
	random = RandomStream.new(seed_value)
	colors = color_count

func next() -> int:
	if bag.is_empty():
		for index in range(colors * 6):
			bag.append(index % colors)
		random.shuffle(bag)
	return bag.pop_back()

func shuffle_board(board: Array, dimensions: Vector2i) -> Array:
	var result = board.duplicate()
	for _attempt in range(20000):
		random.shuffle(result)
		if Board.find_groups(result, dimensions).is_empty() and Board.has_move(result, dimensions):
			return result
	push_error("Board repair exceeded its budget.")
	return []
