#!/usr/bin/env python3

import asyncio
from test_parser_helpers import create_test_parser

async def test_parser():
    parser = create_test_parser()

    # Test 1: Pure JSON format (what AI is producing)
    pure_json_response = '{"functionCall": {"name": "write_file", "args": {"file_path": "config.py", "content": "test"}}}'
    parsed = await parser.parse_response(pure_json_response)
    print('Pure JSON Test:')
    print(f'  Tool calls found: {len(parsed.tool_calls)}')
    if parsed.tool_calls:
        print(f'  Tool name: {parsed.tool_calls[0].tool_name}')
        print(f'  Parameters: {parsed.tool_calls[0].parameters}')
        print(f'  Has tool calls: {parsed.has_tool_calls}')
    print()

    # Test 2: Embedded JSON format (legacy)
    embedded_response = 'I will write that file. "functionCall": {"name": "write_file", "args": {"file_path": "config.py"}}'
    parsed2 = await parser.parse_response(embedded_response)
    print('Embedded JSON Test:')
    print(f'  Tool calls found: {len(parsed2.tool_calls)}')
    if parsed2.tool_calls:
        print(f'  Tool name: {parsed2.tool_calls[0].tool_name}')
        print(f'  Parameters: {parsed2.tool_calls[0].parameters}')
        print(f'  Has tool calls: {parsed2.has_tool_calls}')
    print()

    # Test 3: Computer-use tool format with metadata (new format)
    computer_use_response = '{"metadata": {"explanation": "Clicking button", "expectation": "Button clicked"}, "action": {"functionCall": {"name": "mouse_control", "args": {"action": "click", "x": 100, "y": 200}}}}'
    parsed3 = await parser.parse_response(computer_use_response)
    print('Computer-Use Tool Format Test:')
    print(f'  Tool calls found: {len(parsed3.tool_calls)}')
    if parsed3.tool_calls:
        print(f'  Tool name: {parsed3.tool_calls[0].tool_name}')
        print(f'  Parameters: {parsed3.tool_calls[0].parameters}')
        print(f'  Metadata: {parsed3.tool_calls[0].metadata}')
        print(f'  Has tool calls: {parsed3.has_tool_calls}')
    print()

    # Test 4: Chaining multiple tool calls (computer-use tools)
    chained_response = '{"metadata": {"description": "Screen 1", "explanation": "First action", "expectation": "First result"}, "action": {"functionCall": {"name": "keyboard_control", "args": {"action": "type", "text": "test"}}}} {"metadata": {"description": "Screen 2", "explanation": "Second action", "expectation": "Second result"}, "action": {"functionCall": {"name": "keyboard_control", "args": {"action": "press", "key": "enter"}}}}'
    parsed4 = await parser.parse_response(chained_response)
    print('Chaining Test (Computer-Use Tools):')
    print(f'  Tool calls found: {len(parsed4.tool_calls)}')
    if parsed4.tool_calls:
        for i, call in enumerate(parsed4.tool_calls):
            print(f'  Tool {i+1}: {call.tool_name}')
            print(f'    Metadata: {call.metadata}')
    print()

    # Test 5: Key reordering (action before metadata)
    reordered_response = '{"action": {"functionCall": {"name": "mouse_control", "args": {"action": "click", "x": 100, "y": 200}}}, "metadata": {"description": "Screen", "explanation": "Clicking", "expectation": "Clicked"}}'
    parsed5 = await parser.parse_response(reordered_response)
    print('Key Reordering Test:')
    print(f'  Tool calls found: {len(parsed5.tool_calls)}')
    if parsed5.tool_calls:
        print(f'  Tool name: {parsed5.tool_calls[0].tool_name}')
        print(f'  Metadata: {parsed5.tool_calls[0].metadata}')
        print(f'  Success: {"action key came before metadata but still parsed correctly" if parsed5.tool_calls else "Failed"}')
    print()

    # Test 6: Interleaved text with JSON
    interleaved_response = 'Some text before {"functionCall": {"name": "read_file", "args": {"file_path": "test.txt"}}} and text after'
    parsed6 = await parser.parse_response(interleaved_response)
    print('Interleaved Text Test:')
    print(f'  Tool calls found: {len(parsed6.tool_calls)}')
    print(f'  Text content: "{parsed6.text_content}"')
    if parsed6.tool_calls:
        print(f'  Tool name: {parsed6.tool_calls[0].tool_name}')
    print()

    # Test 7: Regular text (should find no tool calls)
    text_response = 'This is just regular text with no tool calls.'
    parsed7 = await parser.parse_response(text_response)
    print('Regular Text Test:')
    print(f'  Tool calls found: {len(parsed7.tool_calls)}')
    print(f'  Has tool calls: {parsed7.has_tool_calls}')
    print(f'  Text content: "{parsed7.text_content}"')

if __name__ == "__main__":
    asyncio.run(test_parser())
