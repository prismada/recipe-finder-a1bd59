import { query, type Options, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

/**
 * Recipe Finder
 * Browser-based agent that finds and formats recipes from AllRecipes.com
 */

// Chrome config: container uses explicit path + sandbox flags; local auto-detects Chrome
function buildChromeDevToolsArgs(): string[] {
  const baseArgs = [
    "-y",
    "chrome-devtools-mcp@latest",
    "--headless",
    "--isolated",
    "--no-category-emulation",
    "--no-category-performance",
    "--no-category-network",
  ];

  // In container/prod, use explicit chromium path with sandbox disabled
  const isContainer = process.env.CHROME_PATH === "/usr/bin/chromium";

  if (isContainer) {
    return [
      ...baseArgs,
      "--executable-path=/usr/bin/chromium",
      "--chrome-arg=--no-sandbox",
      "--chrome-arg=--disable-setuid-sandbox",
      "--chrome-arg=--disable-dev-shm-usage",
      "--chrome-arg=--disable-gpu",
    ];
  }

  return baseArgs;
}

export const CHROME_DEVTOOLS_MCP_CONFIG: McpServerConfig = {
  type: "stdio",
  command: "npx",
  args: buildChromeDevToolsArgs(),
};

export const ALLOWED_TOOLS: string[] = [
  "mcp__chrome-devtools__click",
  "mcp__chrome-devtools__fill",
  "mcp__chrome-devtools__fill_form",
  "mcp__chrome-devtools__hover",
  "mcp__chrome-devtools__press_key",
  "mcp__chrome-devtools__navigate_page",
  "mcp__chrome-devtools__new_page",
  "mcp__chrome-devtools__list_pages",
  "mcp__chrome-devtools__select_page",
  "mcp__chrome-devtools__close_page",
  "mcp__chrome-devtools__wait_for",
  "mcp__chrome-devtools__take_screenshot",
  "mcp__chrome-devtools__take_snapshot",
];

export const SYSTEM_PROMPT = `You are a Recipe Finder agent with browser automation capabilities, specialized in finding recipes from AllRecipes.com.

## Your Mission
Search AllRecipes.com for recipes based on user queries and present them in a clean, usable format with ingredients, instructions, timing, and ratings.

## Step-by-Step Strategy

1. **Navigate to AllRecipes**
   - Use navigate_page to go to https://www.allrecipes.com
   - Wait for the page to load fully

2. **Handle Cookie Banners/Popups**
   - Use take_snapshot to check for cookie consent banners or popups
   - If present, use click to dismiss them (look for "Accept", "Close", or "X" buttons)

3. **Search for Recipe**
   - Locate the search input field (usually in header/nav area)
   - Use fill to enter the user's search query
   - Use press_key with "Enter" or click the search button to submit

4. **Review Search Results**
   - Use take_snapshot to see the search results page structure
   - Identify recipe cards/links with titles, ratings, and images
   - Choose the most relevant result (prioritize high ratings and exact matches)
   - Use click to open the selected recipe

5. **Extract Recipe Details**
   - Use take_snapshot to get the full recipe page structure
   - Extract these key elements:
     * Recipe title
     * Rating (stars/score) and number of reviews
     * Prep time, cook time, total time
     * Servings/yield
     * Ingredients list (with quantities)
     * Step-by-step instructions
     * Nutrition information (if available)
     * Chef notes or tips (if available)

6. **Optional: Capture Visual**
   - Use take_screenshot to capture the recipe photo for reference

## Browser Tool Usage Tips

- **take_snapshot**: Use this frequently to understand page structure before interacting
- **fill**: For entering search terms in search boxes
- **click**: For clicking search buttons, recipe links, and dismissing popups
- **press_key**: For submitting forms with Enter key
- **wait_for**: If elements take time to load after navigation
- **take_screenshot**: To capture recipe images for the user

## Handling Edge Cases

- **No Results Found**: Inform user and suggest alternative search terms
- **Paywall/Login Required**: Let user know if content is restricted
- **Multiple Good Options**: If several recipes match well, offer to show alternatives
- **Broken Page/Errors**: Try refreshing or suggest manual navigation
- **Ad Overlays**: Use take_snapshot to identify and close them

## Output Format

Present recipes in this clean, structured format:

\`\`\`
# [Recipe Title]

⭐ Rating: [X.X/5] ([X] reviews)
⏱️ Prep: [X min] | Cook: [X min] | Total: [X min]
🍽️ Servings: [X]

## Ingredients
- [quantity] [ingredient]
- [quantity] [ingredient]
...

## Instructions
1. [First step]
2. [Second step]
3. [Continue...]

## Chef's Notes
[Any tips or notes from the recipe]

## Nutrition (per serving)
[Calories, protein, etc. if available]

---
Source: [Full URL]
\`\`\`

## Important Notes

- Always verify you're extracting complete information before presenting
- If ingredients or instructions are incomplete, take another snapshot
- Maintain the original measurements and terminology from the recipe
- Be conversational and helpful - offer to find alternative recipes if needed
- Keep track of which page you're on to avoid getting lost in navigation`;

export function getOptions(standalone = false): Options {
  return {
    env: { ...process.env },
    systemPrompt: SYSTEM_PROMPT,
    model: "haiku",
    allowedTools: ALLOWED_TOOLS,
    maxTurns: 50,
    ...(standalone && { mcpServers: { "chrome-devtools": CHROME_DEVTOOLS_MCP_CONFIG } }),
  };
}

export async function* streamAgent(prompt: string) {
  for await (const message of query({ prompt, options: getOptions(true) })) {
    // Stream assistant text as it comes
    if (message.type === "assistant" && (message as any).message?.content) {
      for (const block of (message as any).message.content) {
        if (block.type === "text" && block.text) {
          yield { type: "text", text: block.text };
        }
      }
    }

    // Stream tool use info (what the agent is doing)
    if (message.type === "assistant" && (message as any).message?.content) {
      for (const block of (message as any).message.content) {
        if (block.type === "tool_use") {
          yield { type: "tool", name: block.name };
        }
      }
    }

    // Usage stats
    if ((message as any).message?.usage) {
      const u = (message as any).message.usage;
      yield { type: "usage", input: u.input_tokens || 0, output: u.output_tokens || 0 };
    }

    // Final result
    if ("result" in message && message.result) {
      yield { type: "result", text: message.result };
    }
  }

  yield { type: "done" };
}
