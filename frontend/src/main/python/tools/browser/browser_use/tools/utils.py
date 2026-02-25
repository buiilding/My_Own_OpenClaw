"""Utility functions for browser tools."""

from browser_use.dom.service import EnhancedDOMTreeNode


def _resolve_checked_state(node: EnhancedDOMTreeNode, default_checked: bool) -> bool:
	"""Return checkbox checked state using AX checked property when available."""
	is_checked = default_checked
	if node.ax_node and node.ax_node.properties:
		for prop in node.ax_node.properties:
			if prop.name == 'checked':
				is_checked = prop.value is True or prop.value == 'true'
				break
	return is_checked


def get_click_description(node: EnhancedDOMTreeNode) -> str:
	"""Get a brief description of the clicked element for memory."""
	parts = []

	# Tag name
	parts.append(node.tag_name)

	# Add type for inputs
	if node.tag_name == 'input' and node.attributes.get('type'):
		input_type = node.attributes['type']
		parts.append(f'type={input_type}')

		# For checkboxes, include checked state
		if input_type == 'checkbox':
			is_checked = _resolve_checked_state(
				node,
				node.attributes.get('checked', 'false').lower() in ['true', 'checked', ''],
			)
			state = 'checked' if is_checked else 'unchecked'
			parts.append(f'checkbox-state={state}')

	# Add role if present
	if node.attributes.get('role'):
		role = node.attributes['role']
		parts.append(f'role={role}')

		# For role=checkbox, include state
		if role == 'checkbox':
			aria_checked = node.attributes.get('aria-checked', 'false').lower()
			is_checked = _resolve_checked_state(node, aria_checked in ['true', 'checked'])
			state = 'checked' if is_checked else 'unchecked'
			parts.append(f'checkbox-state={state}')

	# For labels/spans/divs, check if related to a hidden checkbox
	if node.tag_name in ['label', 'span', 'div'] and 'type=' not in ' '.join(parts):
		# Check children for hidden checkbox
		for child in node.children:
			if child.tag_name == 'input' and child.attributes.get('type') == 'checkbox':
				# Check if hidden
				is_hidden = False
				if child.snapshot_node and child.snapshot_node.computed_styles:
					opacity = child.snapshot_node.computed_styles.get('opacity', '1')
					if opacity == '0' or opacity == '0.0':
						is_hidden = True

					if is_hidden or not child.is_visible:
						# Get checkbox state
						is_checked = _resolve_checked_state(
							child,
							child.attributes.get('checked', 'false').lower() in ['true', 'checked', ''],
						)
						state = 'checked' if is_checked else 'unchecked'
						parts.append(f'checkbox-state={state}')
						break

	# Add short text content if available
	text = node.get_all_children_text().strip()
	if text:
		short_text = text[:30] + ('...' if len(text) > 30 else '')
		parts.append(f'"{short_text}"')

	# Add key attributes like id, name, aria-label
	for attr in ['id', 'name', 'aria-label']:
		if node.attributes.get(attr):
			parts.append(f'{attr}={node.attributes[attr][:20]}')

	return ' '.join(parts)
