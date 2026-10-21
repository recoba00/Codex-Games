shader_type canvas_item;
render_mode unshaded;

void fragment() {
	float aspect = TEXTURE_PIXEL_SIZE.y / TEXTURE_PIXEL_SIZE.x;
	float radius = min(0.055, aspect * 0.12);
	vec2 half_size = vec2(aspect, 1.0) * 0.5;
	vec2 point = abs((UV - vec2(0.5)) * vec2(aspect, 1.0)) - half_size + vec2(radius);
	float distance_to_corner = length(max(point, vec2(0.0))) + min(max(point.x, point.y), 0.0) - radius;
	COLOR.a *= 1.0 - smoothstep(-0.0015, 0.0015, distance_to_corner);
}
