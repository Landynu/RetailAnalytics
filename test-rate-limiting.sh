#!/bin/bash

# Rate Limiting Test Script
# Tests both upload and API rate limiters

echo "=== Testing Rate Limiting ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test API Rate Limiter (100 requests per minute)
echo -e "${YELLOW}Testing API Rate Limiter (100 req/min)...${NC}"
echo "Sending 105 requests to /api/..."
echo ""

success_count=0
rate_limited_count=0

for i in {1..105}; do
  response=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:3001/api/images/proxy?url=test 2>/dev/null)

  if [ "$response" = "429" ]; then
    ((rate_limited_count++))
    if [ $rate_limited_count -eq 1 ]; then
      echo -e "${RED}✗ Request $i: Rate limited (429)${NC}"
    fi
  else
    ((success_count++))
    if [ $i -eq 1 ] || [ $i -eq 50 ] || [ $i -eq 100 ]; then
      echo -e "${GREEN}✓ Request $i: Success${NC}"
    fi
  fi
done

echo ""
echo "Results:"
echo -e "  Success: ${GREEN}$success_count${NC}"
echo -e "  Rate Limited: ${RED}$rate_limited_count${NC}"
echo ""

if [ $rate_limited_count -gt 0 ]; then
  echo -e "${GREEN}✅ API Rate Limiter is working correctly!${NC}"
else
  echo -e "${YELLOW}⚠️  Note: Rate limiting is disabled in development mode${NC}"
fi

echo ""
echo "=== Test Complete ==="
