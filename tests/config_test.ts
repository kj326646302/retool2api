// tests/config_test.ts
/****************************************************************************************
 *  Property-Based Tests for Configuration Module
 *  -------------------------------------------------------------------------------------
 *  Uses fast-check for property-based testing
 *  Run with: deno test --allow-read --allow-env tests/config_test.ts
 *****************************************************************************************/

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import fc from "npm:fast-check@3.22.0";
import { parseClientApiKeys, parseRetoolAccounts, type RetoolAccountConfig } from "../config.ts";

// ============================================================================
// Property 1: Client API Keys Parsing
// **Feature: retool-improvements, Property 1: Client API Keys Parsing**
// **Validates: Requirements 1.1**
// ============================================================================

Deno.test("Property 1: Client API Keys Parsing - keys are correctly parsed and trimmed", () => {
  fc.assert(
    fc.property(
      // Generate array of non-empty strings that don't contain commas
      fc.array(
        fc.string({ minLength: 1 })
          .filter((s) => !s.includes(",") && s.trim().length > 0),
        { minLength: 0, maxLength: 20 }
      ),
      (keys) => {
        // Create comma-separated input with optional whitespace padding
        const input = keys.map((k) => k).join(",");
        const result = parseClientApiKeys(input);
        
        // Property: All trimmed keys should be in the result set
        const trimmedKeys = keys.map((k) => k.trim()).filter((k) => k.length > 0);
        const uniqueTrimmedKeys = [...new Set(trimmedKeys)];
        
        // Result should contain exactly the unique trimmed keys
        return result.size === uniqueTrimmedKeys.length &&
          uniqueTrimmedKeys.every((k) => result.has(k));
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("Property 1: Client API Keys Parsing - whitespace is trimmed", () => {
  fc.assert(
    fc.property(
      // Generate keys with surrounding whitespace
      fc.array(
        fc.tuple(
          fc.string({ minLength: 1 }).filter((s) => !s.includes(",") && s.trim().length > 0),
          fc.stringOf(fc.constantFrom(" ", "\t"), { minLength: 0, maxLength: 3 }),
          fc.stringOf(fc.constantFrom(" ", "\t"), { minLength: 0, maxLength: 3 })
        ),
        { minLength: 1, maxLength: 10 }
      ),
      (keysWithWhitespace) => {
        // Create input with whitespace around keys
        const input = keysWithWhitespace
          .map(([key, before, after]) => `${before}${key}${after}`)
          .join(",");
        const result = parseClientApiKeys(input);
        
        // Property: All keys should be trimmed in the result
        const expectedKeys = keysWithWhitespace.map(([key]) => key.trim());
        const uniqueExpected = [...new Set(expectedKeys)];
        
        return uniqueExpected.every((k) => result.has(k));
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("parseClientApiKeys - empty input returns empty set", () => {
  assertEquals(parseClientApiKeys("").size, 0);
  assertEquals(parseClientApiKeys("   ").size, 0);
});

Deno.test("parseClientApiKeys - single key", () => {
  const result = parseClientApiKeys("sk-test-key");
  assertEquals(result.size, 1);
  assertEquals(result.has("sk-test-key"), true);
});

Deno.test("parseClientApiKeys - multiple keys with whitespace", () => {
  const result = parseClientApiKeys("  key1 , key2  ,  key3  ");
  assertEquals(result.size, 3);
  assertEquals(result.has("key1"), true);
  assertEquals(result.has("key2"), true);
  assertEquals(result.has("key3"), true);
});


// ============================================================================
// Property 2: Retool Accounts JSON Parsing Round Trip
// **Feature: retool-improvements, Property 2: Retool Accounts JSON Parsing Round Trip**
// **Validates: Requirements 1.2**
// ============================================================================

// Generator for valid RetoolAccountConfig objects
const retoolAccountConfigArb = fc.record({
  domain_name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  x_xsrf_token: fc.string({ minLength: 1 }),
  accessToken: fc.string({ minLength: 1 }),
});

Deno.test("Property 2: Retool Accounts JSON Parsing Round Trip", () => {
  fc.assert(
    fc.property(
      fc.array(retoolAccountConfigArb, { minLength: 0, maxLength: 10 }),
      (accounts) => {
        // Serialize to JSON
        const jsonStr = JSON.stringify(accounts);
        
        // Parse via our function
        const result = parseRetoolAccounts(jsonStr);
        
        // Property: Result should have same length as input
        if (result.length !== accounts.length) return false;
        
        // Property: Each account should have correct config fields preserved
        for (let i = 0; i < accounts.length; i++) {
          const original = accounts[i];
          const parsed = result[i];
          
          if (parsed.domain_name !== original.domain_name) return false;
          if (parsed.x_xsrf_token !== original.x_xsrf_token) return false;
          if (parsed.accessToken !== original.accessToken) return false;
          
          // Property: Runtime fields should be initialized correctly
          if (parsed.is_valid !== true) return false;
          if (parsed.last_used !== 0) return false;
          if (parsed.error_count !== 0) return false;
          if (!Array.isArray(parsed.agents) || parsed.agents.length !== 0) return false;
        }
        
        return true;
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("parseRetoolAccounts - empty input returns empty array", () => {
  assertEquals(parseRetoolAccounts("").length, 0);
  assertEquals(parseRetoolAccounts("   ").length, 0);
});

Deno.test("parseRetoolAccounts - valid JSON array", () => {
  const input = JSON.stringify([
    {
      domain_name: "test.retool.com",
      x_xsrf_token: "token123",
      accessToken: "access456",
    },
  ]);
  const result = parseRetoolAccounts(input);
  
  assertEquals(result.length, 1);
  assertEquals(result[0].domain_name, "test.retool.com");
  assertEquals(result[0].x_xsrf_token, "token123");
  assertEquals(result[0].accessToken, "access456");
  assertEquals(result[0].is_valid, true);
  assertEquals(result[0].last_used, 0);
  assertEquals(result[0].error_count, 0);
  assertEquals(result[0].agents.length, 0);
});

Deno.test("parseRetoolAccounts - throws on non-array JSON", () => {
  assertThrows(
    () => parseRetoolAccounts('{"not": "array"}'),
    Error,
    "RETOOL_ACCOUNTS must be a JSON array"
  );
});

Deno.test("parseRetoolAccounts - throws on invalid JSON", () => {
  assertThrows(
    () => parseRetoolAccounts("not valid json"),
    SyntaxError
  );
});


// ============================================================================
// loadConfig Tests
// **Validates: Requirements 1.3, 1.4**
// ============================================================================

import { loadConfig } from "../config.ts";

// Helper to temporarily set environment variables
function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void
): void {
  const originalValues: Record<string, string | undefined> = {};
  
  // Save original values and set new ones
  for (const [key, value] of Object.entries(vars)) {
    originalValues[key] = Deno.env.get(key);
    if (value === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, value);
    }
  }
  
  try {
    fn();
  } finally {
    // Restore original values
    for (const [key, value] of Object.entries(originalValues)) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  }
}

Deno.test("loadConfig - throws on missing CLIENT_API_KEYS", () => {
  withEnv(
    {
      CLIENT_API_KEYS: undefined,
      RETOOL_ACCOUNTS: JSON.stringify([{ domain_name: "test.com", x_xsrf_token: "x", accessToken: "y" }]),
    },
    () => {
      assertThrows(
        () => loadConfig(),
        Error,
        "CLIENT_API_KEYS"
      );
    }
  );
});

Deno.test("loadConfig - throws on missing RETOOL_ACCOUNTS", () => {
  withEnv(
    {
      CLIENT_API_KEYS: "key1,key2",
      RETOOL_ACCOUNTS: undefined,
    },
    () => {
      assertThrows(
        () => loadConfig(),
        Error,
        "RETOOL_ACCOUNTS"
      );
    }
  );
});

Deno.test("loadConfig - throws on both missing", () => {
  withEnv(
    {
      CLIENT_API_KEYS: undefined,
      RETOOL_ACCOUNTS: undefined,
    },
    () => {
      assertThrows(
        () => loadConfig(),
        Error,
        "CLIENT_API_KEYS"
      );
    }
  );
});

Deno.test("loadConfig - successfully loads valid config", () => {
  withEnv(
    {
      CLIENT_API_KEYS: "key1, key2, key3",
      RETOOL_ACCOUNTS: JSON.stringify([
        { domain_name: "test.retool.com", x_xsrf_token: "token", accessToken: "access" },
      ]),
      DEBUG_MODE: "true",
    },
    () => {
      const config = loadConfig();
      
      assertEquals(config.clientApiKeys.size, 3);
      assertEquals(config.clientApiKeys.has("key1"), true);
      assertEquals(config.clientApiKeys.has("key2"), true);
      assertEquals(config.clientApiKeys.has("key3"), true);
      
      assertEquals(config.retoolAccounts.length, 1);
      assertEquals(config.retoolAccounts[0].domain_name, "test.retool.com");
      assertEquals(config.retoolAccounts[0].is_valid, true);
      
      assertEquals(config.debugMode, true);
    }
  );
});

Deno.test("loadConfig - DEBUG_MODE defaults to false", () => {
  withEnv(
    {
      CLIENT_API_KEYS: "key1",
      RETOOL_ACCOUNTS: JSON.stringify([
        { domain_name: "test.com", x_xsrf_token: "x", accessToken: "y" },
      ]),
      DEBUG_MODE: undefined,
    },
    () => {
      const config = loadConfig();
      assertEquals(config.debugMode, false);
    }
  );
});

Deno.test("loadConfig - throws on invalid RETOOL_ACCOUNTS JSON", () => {
  withEnv(
    {
      CLIENT_API_KEYS: "key1",
      RETOOL_ACCOUNTS: "not valid json",
    },
    () => {
      assertThrows(
        () => loadConfig(),
        Error,
        "Failed to parse RETOOL_ACCOUNTS"
      );
    }
  );
});

Deno.test("loadConfig - throws on empty CLIENT_API_KEYS", () => {
  withEnv(
    {
      CLIENT_API_KEYS: "   ",
      RETOOL_ACCOUNTS: JSON.stringify([
        { domain_name: "test.com", x_xsrf_token: "x", accessToken: "y" },
      ]),
    },
    () => {
      assertThrows(
        () => loadConfig(),
        Error,
        "CLIENT_API_KEYS is empty"
      );
    }
  );
});


// ============================================================================
// Property 3: Error Object Completeness
// **Feature: retool-improvements, Property 3: Error Object Completeness**
// **Validates: Requirements 2.1**
// ============================================================================

import { createRetoolError, logRetoolError, type RetoolError, type RetoolOperation } from "../config.ts";

// Generator for valid RetoolOperation values
const retoolOperationArb = fc.constantFrom<RetoolOperation>(
  "agent_query",
  "thread_create",
  "message_send",
  "message_get"
);

Deno.test("Property 3: Error Object Completeness - all required fields present", () => {
  fc.assert(
    fc.property(
      retoolOperationArb,
      fc.string({ minLength: 1 }), // account
      fc.string({ minLength: 1 }), // message
      fc.option(fc.integer({ min: 100, max: 599 }), { nil: undefined }), // statusCode
      (operation, account, message, statusCode) => {
        const error = createRetoolError(operation, account, message, statusCode);
        
        // Property: All required fields must be present
        if (error.operation !== operation) return false;
        if (error.account !== account) return false;
        if (error.message !== message) return false;
        if (error.statusCode !== statusCode) return false;
        
        // Property: Timestamp must be a valid ISO string
        if (typeof error.timestamp !== "string") return false;
        const parsedDate = new Date(error.timestamp);
        if (isNaN(parsedDate.getTime())) return false;
        
        return true;
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("Property 3: Error Object Completeness - timestamp is recent", () => {
  fc.assert(
    fc.property(
      retoolOperationArb,
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      (operation, account, message) => {
        const before = Date.now();
        const error = createRetoolError(operation, account, message);
        const after = Date.now();
        
        const errorTime = new Date(error.timestamp).getTime();
        
        // Property: Timestamp should be between before and after creation
        return errorTime >= before && errorTime <= after;
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("createRetoolError - creates error with all fields", () => {
  const error = createRetoolError("agent_query", "test.retool.com", "Test error", 401);
  
  assertEquals(error.operation, "agent_query");
  assertEquals(error.account, "test.retool.com");
  assertEquals(error.message, "Test error");
  assertEquals(error.statusCode, 401);
  assertEquals(typeof error.timestamp, "string");
});

Deno.test("createRetoolError - statusCode is optional", () => {
  const error = createRetoolError("thread_create", "test.retool.com", "Test error");
  
  assertEquals(error.operation, "thread_create");
  assertEquals(error.account, "test.retool.com");
  assertEquals(error.message, "Test error");
  assertEquals(error.statusCode, undefined);
  assertEquals(typeof error.timestamp, "string");
});

Deno.test("logRetoolError - logs all fields", () => {
  // Capture console.error output
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  
  try {
    const error: RetoolError = {
      operation: "message_send",
      account: "test.retool.com",
      statusCode: 500,
      message: "Internal Server Error",
      timestamp: "2025-12-10T10:30:00.000Z",
    };
    
    logRetoolError(error);
    
    // Verify all fields are logged
    assertEquals(logs.some(l => l.includes("Retool API failed")), true);
    assertEquals(logs.some(l => l.includes("Operation: message_send")), true);
    assertEquals(logs.some(l => l.includes("Account: test.retool.com")), true);
    assertEquals(logs.some(l => l.includes("Status: 500")), true);
    assertEquals(logs.some(l => l.includes("Message: Internal Server Error")), true);
    assertEquals(logs.some(l => l.includes("Timestamp: 2025-12-10T10:30:00.000Z")), true);
  } finally {
    console.error = originalError;
  }
});

Deno.test("logRetoolError - omits status when undefined", () => {
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  
  try {
    const error: RetoolError = {
      operation: "agent_query",
      account: "test.retool.com",
      message: "Connection failed",
      timestamp: "2025-12-10T10:30:00.000Z",
    };
    
    logRetoolError(error);
    
    // Verify status is not logged when undefined
    assertEquals(logs.some(l => l.includes("Status:")), false);
  } finally {
    console.error = originalError;
  }
});


// ============================================================================
// Property 4: Error Response Structure
// **Feature: retool-improvements, Property 4: Error Response Structure**
// **Validates: Requirements 2.3**
// ============================================================================

import { createErrorResponse, createConfigErrorResponse, type ErrorResponse } from "../config.ts";

// Generator for RetoolError objects
const retoolErrorArb = fc.record({
  operation: retoolOperationArb,
  account: fc.string({ minLength: 1 }),
  statusCode: fc.option(fc.integer({ min: 100, max: 599 }), { nil: undefined }),
  message: fc.string({ minLength: 1 }),
  timestamp: fc.date().map(d => d.toISOString()),
});

Deno.test("Property 4: Error Response Structure - contains attempts and non-empty details", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100 }), // attempts
      fc.array(retoolErrorArb, { minLength: 1, maxLength: 20 }), // errors
      (attempts, errors) => {
        const response = createErrorResponse(attempts, errors);
        
        // Property: Response must have error object
        if (!response.error) return false;
        
        // Property: Error must have message
        if (typeof response.error.message !== "string") return false;
        if (response.error.message.length === 0) return false;
        
        // Property: Error must have type "upstream_error"
        if (response.error.type !== "upstream_error") return false;
        
        // Property: Attempts must match input
        if (response.error.attempts !== attempts) return false;
        
        // Property: Details must be non-empty array matching input
        if (!Array.isArray(response.error.details)) return false;
        if (response.error.details.length !== errors.length) return false;
        
        return true;
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("Property 4: Error Response Structure - details preserve error information", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 10 }),
      fc.array(retoolErrorArb, { minLength: 1, maxLength: 10 }),
      (attempts, errors) => {
        const response = createErrorResponse(attempts, errors);
        
        // Property: Each error in details should match the input errors
        for (let i = 0; i < errors.length; i++) {
          const original = errors[i];
          const detail = response.error.details![i];
          
          if (detail.operation !== original.operation) return false;
          if (detail.account !== original.account) return false;
          if (detail.message !== original.message) return false;
          if (detail.statusCode !== original.statusCode) return false;
          if (detail.timestamp !== original.timestamp) return false;
        }
        
        return true;
      }
    ),
    { numRuns: 100 }
  );
});

Deno.test("createErrorResponse - creates structured response", () => {
  const errors: RetoolError[] = [
    {
      operation: "thread_create",
      account: "domain1.retool.com",
      statusCode: 401,
      message: "Unauthorized",
      timestamp: "2025-12-10T10:30:00.000Z",
    },
    {
      operation: "agent_query",
      account: "domain2.retool.com",
      statusCode: 500,
      message: "Internal Server Error",
      timestamp: "2025-12-10T10:30:01.000Z",
    },
  ];
  
  const response = createErrorResponse(2, errors);
  
  assertEquals(response.error.message, "All Retool accounts failed");
  assertEquals(response.error.type, "upstream_error");
  assertEquals(response.error.attempts, 2);
  assertEquals(response.error.details?.length, 2);
  assertEquals(response.error.details?.[0].account, "domain1.retool.com");
  assertEquals(response.error.details?.[1].account, "domain2.retool.com");
});

Deno.test("createConfigErrorResponse - creates configuration error", () => {
  const response = createConfigErrorResponse("Missing required environment variables: CLIENT_API_KEYS");
  
  assertEquals(response.error.message, "Missing required environment variables: CLIENT_API_KEYS");
  assertEquals(response.error.type, "configuration_error");
  assertEquals(response.error.attempts, undefined);
  assertEquals(response.error.details, undefined);
});
