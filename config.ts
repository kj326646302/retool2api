// config.ts
/****************************************************************************************
 *  Configuration Module for Retool OpenAI API Adapter
 *  -------------------------------------------------------------------------------------
 *  Handles environment variable parsing and validation
 *****************************************************************************************/

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
export type RetoolAccountConfig = {
  domain_name: string;
  x_xsrf_token: string;
  accessToken: string;
};

export type RetoolAccount = RetoolAccountConfig & {
  is_valid: boolean;
  last_used: number;
  error_count: number;
  agents: any[];
  selected_agent_id?: string;
};

export type Config = {
  clientApiKeys: Set<string>;
  retoolAccounts: RetoolAccount[];
  debugMode: boolean;
};

// ----------------------------------------------------------------------------
// Parsing Functions
// ----------------------------------------------------------------------------

/**
 * Parse comma-separated CLIENT_API_KEYS environment variable into a Set.
 * Each key is trimmed of whitespace.
 * 
 * @param input - Comma-separated string of API keys
 * @returns Set of trimmed API keys (empty keys are filtered out)
 */
export function parseClientApiKeys(input: string): Set<string> {
  if (!input || input.trim() === "") {
    return new Set<string>();
  }
  
  const keys = input
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  
  return new Set<string>(keys);
}

/**
 * Parse RETOOL_ACCOUNTS JSON environment variable into RetoolAccount array.
 * Initializes runtime fields (is_valid, last_used, error_count, agents).
 * 
 * @param input - JSON string containing array of RetoolAccountConfig objects
 * @returns Array of RetoolAccount with initialized runtime fields
 * @throws Error if JSON is invalid or doesn't contain an array
 */
export function parseRetoolAccounts(input: string): RetoolAccount[] {
  if (!input || input.trim() === "") {
    return [];
  }

  const parsed = JSON.parse(input);
  
  if (!Array.isArray(parsed)) {
    throw new Error("RETOOL_ACCOUNTS must be a JSON array");
  }

  return parsed.map((account: RetoolAccountConfig) => ({
    domain_name: account.domain_name,
    x_xsrf_token: account.x_xsrf_token,
    accessToken: account.accessToken,
    // Initialize runtime fields
    is_valid: true,
    last_used: 0,
    error_count: 0,
    agents: [],
  }));
}


// ----------------------------------------------------------------------------
// Configuration Loading
// ----------------------------------------------------------------------------

/**
 * Load configuration from environment variables.
 * Validates required variables and exits gracefully on errors.
 * 
 * Required environment variables:
 * - CLIENT_API_KEYS: Comma-separated list of valid client API keys
 * - RETOOL_ACCOUNTS: JSON array of Retool account configurations
 * 
 * Optional environment variables:
 * - DEBUG_MODE: "true" or "false" (default: false)
 * 
 * @returns Config object with parsed values
 * @throws Error if required environment variables are missing or invalid
 */
export function loadConfig(): Config {
  const missingVars: string[] = [];
  const errors: string[] = [];

  // Check for required environment variables
  const clientApiKeysEnv = Deno.env.get("CLIENT_API_KEYS");
  const retoolAccountsEnv = Deno.env.get("RETOOL_ACCOUNTS");
  const debugModeEnv = Deno.env.get("DEBUG_MODE");

  if (!clientApiKeysEnv) {
    missingVars.push("CLIENT_API_KEYS");
  }

  if (!retoolAccountsEnv) {
    missingVars.push("RETOOL_ACCOUNTS");
  }

  // Log and exit if required variables are missing
  if (missingVars.length > 0) {
    const message = `Missing required environment variables: ${missingVars.join(", ")}`;
    console.error(`[ERROR] Configuration failed: ${message}`);
    throw new Error(message);
  }

  // Parse CLIENT_API_KEYS
  let clientApiKeys: Set<string>;
  try {
    clientApiKeys = parseClientApiKeys(clientApiKeysEnv!);
    if (clientApiKeys.size === 0) {
      errors.push("CLIENT_API_KEYS is empty or contains only whitespace");
    }
  } catch (e) {
    errors.push(`Failed to parse CLIENT_API_KEYS: ${e instanceof Error ? e.message : String(e)}`);
    clientApiKeys = new Set();
  }

  // Parse RETOOL_ACCOUNTS
  let retoolAccounts: RetoolAccount[];
  try {
    retoolAccounts = parseRetoolAccounts(retoolAccountsEnv!);
    if (retoolAccounts.length === 0) {
      errors.push("RETOOL_ACCOUNTS is empty or contains no valid accounts");
    }
  } catch (e) {
    errors.push(`Failed to parse RETOOL_ACCOUNTS: ${e instanceof Error ? e.message : String(e)}`);
    retoolAccounts = [];
  }

  // Log and exit if there are parsing errors
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[ERROR] Configuration failed: ${error}`);
    }
    throw new Error(errors.join("; "));
  }

  // Parse optional DEBUG_MODE
  const debugMode = debugModeEnv?.toLowerCase() === "true";

  return {
    clientApiKeys,
    retoolAccounts,
    debugMode,
  };
}


// ----------------------------------------------------------------------------
// Error Handling Types and Functions
// ----------------------------------------------------------------------------

/**
 * Operation types for Retool API calls
 */
export type RetoolOperation = "agent_query" | "thread_create" | "message_send" | "message_get";

/**
 * Structured error object for Retool API failures.
 * Contains all required fields for detailed error logging.
 */
export type RetoolError = {
  operation: RetoolOperation;
  account: string;
  statusCode?: number;
  message: string;
  timestamp: string;
};

/**
 * Create a RetoolError object with current timestamp.
 * 
 * @param operation - The operation that failed
 * @param account - The account domain that was used
 * @param message - Error message describing the failure
 * @param statusCode - Optional HTTP status code
 * @returns RetoolError object with all required fields
 */
export function createRetoolError(
  operation: RetoolOperation,
  account: string,
  message: string,
  statusCode?: number
): RetoolError {
  return {
    operation,
    account,
    statusCode,
    message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log a RetoolError with structured format.
 * Outputs error details in a clear, readable format.
 * 
 * @param error - The RetoolError object to log
 */
export function logRetoolError(error: RetoolError): void {
  console.error(`[ERROR] Retool API failed`);
  console.error(`  Operation: ${error.operation}`);
  console.error(`  Account: ${error.account}`);
  if (error.statusCode !== undefined) {
    console.error(`  Status: ${error.statusCode}`);
  }
  console.error(`  Message: ${error.message}`);
  console.error(`  Timestamp: ${error.timestamp}`);
}


// ----------------------------------------------------------------------------
// Error Response Types and Functions
// ----------------------------------------------------------------------------

/**
 * Error type classification for responses
 */
export type ErrorType = "configuration_error" | "upstream_error" | "auth_error";

/**
 * Structured error response format for API responses.
 */
export type ErrorResponse = {
  error: {
    message: string;
    type: ErrorType;
    attempts?: number;
    details?: RetoolError[];
  };
};

/**
 * Create a structured error response when all Retool accounts fail.
 * Includes the number of attempts made and details of each failure.
 * 
 * @param attempts - Number of account attempts made
 * @param errors - Array of RetoolError objects from failed attempts
 * @returns ErrorResponse object with structured error information
 */
export function createErrorResponse(attempts: number, errors: RetoolError[]): ErrorResponse {
  return {
    error: {
      message: "All Retool accounts failed",
      type: "upstream_error",
      attempts,
      details: errors,
    },
  };
}

/**
 * Create a configuration error response.
 * 
 * @param message - Error message describing the configuration issue
 * @returns ErrorResponse object for configuration errors
 */
export function createConfigErrorResponse(message: string): ErrorResponse {
  return {
    error: {
      message,
      type: "configuration_error",
    },
  };
}
