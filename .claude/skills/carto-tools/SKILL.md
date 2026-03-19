---
name: carto-tools
description: "Quick reference for Cartogopher MCP tools — discovery, search, code understanding, architecture, and full-stack tracing"
user-invocable: false
---

# Cartogopher Tools Quick Reference

**Discovery & Search:**
- `shake` — Repository overview
- `search <query>` — Find functions/types by name
- `supersearch <query>` — AST-aware search (strings, comments, identifiers)
- `api_surface` — List exported functions and types
- `all_endpoints` — List all API endpoints

**Code Understanding:**
- `symbol <name>` — Detailed info about function/type
- `related_to <symbol>` — Find call relationships
- `file_functions <path>` — Function graph of a file
- `package_summary <package>` — Package overview

**Architecture & Placement:**
- `architecture_map <intent>` — Where to add new code
- `suggest_placement` — Optimal function location
- `crud_operations` — CRUD operations for entities

**Full-Stack Tracing:**
- `api_trace <endpoint>` — Frontend → handler → CRUD
- `slice <file> <start> <end>` — Read specific line range (use sparingly)

**Token Savings:**
- File read: 5,000 tokens → symbol: 200 tokens (96% savings)
- Directory: 2,000 tokens → search: 100 tokens (95% savings)
