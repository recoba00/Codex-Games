class_name SoulBoard
extends RefCounted

const RandomStream = preload("res://scripts/core/random_stream.gd")

static func adjacent(a: int, b: int, dimensions: Vector2i) -> bool:
	return a >= 0 and b >= 0 and a < dimensions.x * dimensions.y and b < dimensions.x * dimensions.y \
		and absi(a % dimensions.x - b % dimensions.x) + absi(a / dimensions.x - b / dimensions.x) == 1

static func neighbors(cell: int, dimensions: Vector2i) -> Array:
	var result: Array = []
	for candidate in [cell - dimensions.x, cell - 1, cell + 1, cell + dimensions.x]:
		if adjacent(cell, candidate, dimensions):
			result.append(candidate)
	return result

static func moved(board: Array, a: int, b: int) -> Array:
	var result = board.duplicate()
	result[a] = board[b]
	result[b] = board[a]
	return result

static func find_groups(board: Array, dimensions: Vector2i, wave: int = 0) -> Array:
	var matched: Dictionary = {}
	for cell in range(board.size()):
		var x = cell % dimensions.x
		var y: int = cell / dimensions.x
		for line in [[1, dimensions.x - x], [dimensions.x, dimensions.y - y]]:
			var step: int = line[0]
			var available: int = line[1]
			if available < 3:
				continue
			var count = 1
			while count < available and board[cell + count * step] == board[cell]:
				count += 1
			if count >= 3:
				for offset in range(count):
					matched[cell + offset * step] = true
	var ordered = matched.keys()
	ordered.sort()
	var result: Array = []
	for cell in ordered:
		if not matched.has(cell):
			continue
		var color = board[cell]
		var cells: Array = []
		var pending: Array = [cell]
		matched.erase(cell)
		while not pending.is_empty():
			var current: int = pending.pop_back()
			cells.append(current)
			for candidate in neighbors(current, dimensions):
				if matched.has(candidate) and board[candidate] == color:
					matched.erase(candidate)
					pending.append(candidate)
		cells.sort()
		result.append({"color": color, "cells": cells, "wave": wave})
	result.sort_custom(func(a, b): return a.color < b.color or (a.color == b.color and a.cells[0] < b.cells[0]))
	return result

static func has_move(board: Array, dimensions: Vector2i) -> bool:
	for cell in range(board.size()):
		for candidate in neighbors(cell, dimensions):
			if candidate > cell and board[cell] != board[candidate] and not find_groups(moved(board, cell, candidate), dimensions).is_empty():
				return true
	return false

static func initial_counts(dimensions: Vector2i, seed_value: int, color_count: int = 5) -> Array:
	var total = dimensions.x * dimensions.y
	var counts: Array = []
	var order: Array = []
	for color in range(color_count):
		counts.append(total / color_count)
		order.append(color)
	RandomStream.new(seed_value).shuffle(order)
	for index in range(total % color_count):
		counts[order[index]] += 1
	return counts

static func create_board(dimensions: Vector2i, layout_seed: int, count_seed: int, color_count: int = 5) -> Array:
	var random = RandomStream.new(layout_seed)
	var colors: Array = []
	var counts = initial_counts(dimensions, count_seed, color_count)
	for color in range(color_count):
		for _index in range(counts[color]):
			colors.append(color)
	for _attempt in range(20000):
		random.shuffle(colors)
		if find_groups(colors, dimensions).is_empty() and has_move(colors, dimensions):
			return colors.duplicate()
	push_error("Playable board generation exceeded its budget.")
	return []

static func simple_match(board: Array, dimensions: Vector2i, choice: int = 0) -> Array:
	var candidates: Array = []
	var least_groups = 100000
	var least_cells = 100000
	for cell in range(board.size()):
		for candidate in neighbors(cell, dimensions):
			if candidate <= cell or board[cell] == board[candidate]:
				continue
			var groups = find_groups(moved(board, cell, candidate), dimensions)
			if groups.is_empty():
				continue
			var cell_count = 0
			for group in groups:
				cell_count += group.cells.size()
			if groups.size() < least_groups or (groups.size() == least_groups and cell_count < least_cells):
				least_groups = groups.size()
				least_cells = cell_count
				candidates.clear()
			if groups.size() == least_groups and cell_count == least_cells:
				candidates.append([cell, candidate])
	if candidates.is_empty():
		return []
	return candidates[(choice & 0xffffffff) % candidates.size()].duplicate()

static func resolve(board: Array, dimensions: Vector2i, refill: RefCounted) -> Dictionary:
	var current = board.duplicate()
	var groups: Array = []
	var waves: Array = []
	for wave in range(32):
		var matches = find_groups(current, dimensions, wave)
		if matches.is_empty():
			var shuffled = not has_move(current, dimensions)
			if shuffled:
				current = refill.shuffle_board(current, dimensions)
			return {"board": current, "groups": groups, "waves": waves, "shuffled": shuffled}
		groups.append_array(matches)
		var before = current.duplicate()
		var gone: Dictionary = {}
		for group in matches:
			for cell in group.cells:
				gone[cell] = true
		for col in range(dimensions.x):
			var remaining: Array = []
			for row in range(dimensions.y - 1, -1, -1):
				var cell = row * dimensions.x + col
				if not gone.has(cell):
					remaining.append(current[cell])
			var index = 0
			for row in range(dimensions.y - 1, -1, -1):
				current[row * dimensions.x + col] = remaining[index] if index < remaining.size() else refill.next()
				index += 1
		waves.append({"before": before, "after": current.duplicate(), "groups": matches})
	push_error("Cascade safety limit reached.")
	return {}

static func size_multiplier(count: int) -> float:
	return minf(2.0, 1.0 + maxi(0, count - 3) * 0.25)

static func combo_multiplier(count: int) -> float:
	return minf(1.5, 1.0 + maxi(0, count - 1) * 0.1)
