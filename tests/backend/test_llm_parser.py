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

    # Test 3: Regular text (should find no tool calls)
    text_response = 'This is just regular text with no tool calls.'
    parsed3 = await parser.parse_response(text_response)
    print('Regular Text Test:')
    print(f'  Tool calls found: {len(parsed3.tool_calls)}')
    print(f'  Has tool calls: {parsed3.has_tool_calls}')
    print(f'  Text content: "{parsed3.text_content}"')

if __name__ == "__main__":
    asyncio.run(test_parser())
