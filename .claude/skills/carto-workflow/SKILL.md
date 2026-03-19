---
name: carto-workflow
description: "Optimal Cartogopher workflows for common RetailAnalytics development tasks — adding features, debugging, finding code locations"
user-invocable: false
---

# Cartogopher Workflows

## Adding a New Feature
```
1. shake                              # Overall structure
2. architecture_map "feature type"    # Where code should go
3. search "similar feature"           # Find existing patterns
4. symbol "existingFunction"          # Understand pattern
5. suggest_placement                  # Confirm location
6. slice (only if needed)             # Read specific sections
```

## Debugging/Understanding Code
```
1. search "bug keyword"               # Find relevant code
2. symbol "suspiciousFunction"        # Function details
3. related_to "suspiciousFunction"    # Call graph
4. api_trace "/api/endpoint"          # Full request flow
5. slice (only if needed)             # Specific lines
```

## Finding Where to Add Code
```
1. architecture_map "intent"          # Get suggestions
2. file_functions "target/file.js"    # Existing functions
3. package_summary "package"          # Package purpose
4. suggest_placement                  # Optimal location
```

## Understanding WASP Operations
```
1. all_endpoints                      # List endpoints
2. search "operationName"             # Find declaration + implementation
3. symbol "operationName"             # Handler logic
4. related_to "operationName"         # Call chain
```

## Exploring Inventory/Analytics Domain
```
1. search "inventory"                 # Find inventory-related code
2. crud_operations                    # CRUD patterns for entities
3. related_to "getOrderingAnalytics"  # Understand ordering flow
4. api_trace "/api/upload"            # CSV upload flow
```

**Remember**: Always search before reading files to save 95-98% tokens!
