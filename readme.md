# LLM Web Interaction Agent & Chrome Extension

This project enables users to interact with web pages using natural language through a Chrome extension. The extension communicates with a backend system of AI agents built with the Google Agent Development Kit (ADK).

## Project Structure

*   **`/llm-web-use` (Chrome Extension)**
    *   `manifest.json`: Defines the extension's permissions, background script, and side panel.
    *   `sidepanel.html` / `sidepanel.css` / `sidepanel.js`: UI and core logic for the user-facing chat interface in the Chrome side panel.
    *   `browser_actions.js`: Utility script injected into web pages by `sidepanel.js` to perform DOM manipulations (e.g., click, fill, scroll, draw bounding boxes).
    *   `background.js`: Extension service worker (currently minimal).
*   **`/agents` (Backend ADK Agents)**
    *   `kick_off_agents.sh`: Bash script to stop existing services on port 8000 and start the ADK API server.
    *   `/browser_chat`: Contains the ADK agent for managing the chat conversation and initiating browser control tasks.
    *   `/browser_controller`:
        *   `agent.py`: Defines the `browser_controller` ADK agent and its sub-agents (`navigate_agent`, `click_agent`, `fill_agent`, `scroll_agent`, `information_gather_agent`, `concluding_agent`). This agent executes specific browser actions delegated by `browser_chat` via the Chrome extension.

## Setup and Running

### 1. Prerequisites

*   Google Chrome browser.
*   Access to a Google AI model compatible with the ADK agents (e.g., Gemini).
*   Python environment with the Google Agent Development Kit (`google-adk`) installed.
*   Environment variables configured for ADK and Google Cloud/AI Platform access (e.g., via a `.env` file in the `/agents` directory).

### 2. Backend Agent Setup

The backend ADK API server hosts and runs the `browser_chat` and `browser_controller` agents.

**To start the backend ADK API server:**

1.  Ensure your `.env` file in the `/agents` directory is configured with necessary API keys and project settings for the ADK and Google AI models.
2.  Navigate to the `/agents` directory in your terminal.
3.  Make the `kick_off_agents.sh` script executable:
    ```bash
    chmod +x kick_off_agents.sh
    ```
4.  Run the script:
    ```bash
    ./kick_off_agents.sh
    ```
    This script will:
    *   Stop any existing process listening on port 8000.
    *   Start the `adk api_server` in the background. This server listens on `http://0.0.0.0:8000` and handles requests to different agent applications like `/apps/browser_chat` and `/apps/browser_controller`.
    *   Automatically create an initial session for the `browser_chat` agent for user `u_123` and session `s_123`.

    The Chrome extension is configured to communicate with this server at `http://0.0.0.0:8000/run`.

### 3. Chrome Extension Setup

**To load and run the Chrome extension:**

1.  Open Google Chrome.
2.  Navigate to the Extensions page: `chrome://extensions`.
3.  Enable **Developer mode** (toggle switch, usually in the top-right corner).
4.  Click the **\"Load unpacked\"** button (usually top-left).
5.  In the file dialog, navigate to and select the `/llm-web-use` directory (the one containing `manifest.json`).
6.  The \"LLM Web Use\" extension will appear in your list. Ensure it is enabled.
7.  The extension icon should appear in the Chrome toolbar. Clicking it (or the dedicated side panel icon, depending on your Chrome version) will open the side panel.

### 4. Using the Extension

1.  Ensure the backend ADK API server is running (Step 2).
2.  Ensure the Chrome extension is loaded and enabled (Step 3).
3.  Open the side panel in Chrome.
4.  Type messages to interact with the `browser_chat` agent.
5.  To trigger browser automation (e.g., \"go to youtube.com and search for \'agent development kit\'\"), phrase your request accordingly. The `browser_chat` agent will then coordinate with `browser_controller` to perform actions on the active web page if it deems it necessary.

## Key Communication Flow

1.  **User Input (Side Panel):** User types a message. `sidepanel.js` captures the message and a screenshot of the current web page.
2.  **To `browser_chat`:** This data is sent to the ADK API server (`http://0.0.0.0:8000/run`) targeting the `browser_chat` app.
3.  **Agent Processing (`browser_chat`):** `browser_chat` processes the input. If browser interaction is required, it responds to the side panel with a `perform_action` event, typically containing a high-level plan.
4.  **To `browser_controller` (Initiation):** On receiving `perform_action`, `sidepanel.js` makes a new request to the ADK API server, this time targeting the `browser_controller` app. It sends the plan (e.g., goal, steps, end state) and a current screenshot.
5.  **Controller Loop (`browser_controller` <-> `sidepanel.js`):**
    *   `browser_controller` receives the state/plan and delegates to one of its sub-agents (e.g., `navigate_agent`, `click_agent`).
    *   The sub-agent's decision (e.g., specific URL to navigate to, or bounding box of an element to click) is sent back to `sidepanel.js`.
    *   `sidepanel.js` (`executeControllerAction`) performs the requested browser action:
        *   **Navigation:** Uses `chrome.tabs.update`.
        *   **DOM Actions (Click, Fill, Scroll):** Injects `browser_actions.js` into the web page and calls the relevant function (`pagePerformClick`, `pagePerformFill`, etc.).
        *   **Information Gathering:** Acknowledges information received from the agent.
    *   `sidepanel.js` captures a new screenshot, reports the outcome (success/failure, any errors, or gathered info) and the new screenshot back to `browser_controller`.
    *   This cycle continues until `browser_controller` delegates to `concluding_agent`.
6.  **Conclusion:** `concluding_agent` provides a final message, displayed in the side panel, and the automation terminates.

## Troubleshooting

*   **\"Failed to inject browser_actions.js...\"**: Ensure `browser_actions.js` is listed in `web_accessible_resources` in `llm-web-use/manifest.json` with the path `\"browser_actions.js\"` (relative to `manifest.json`). Reload the extension in `chrome://extensions` after any `manifest.json` changes.
*   **\"Cannot access a chrome:// URL\" / \"Cannot access a file:// URL\"**: The extension tried to inject a script into a restricted page. The `browser_controller` agent should first navigate to a standard `http://` or `https://` webpage before attempting actions like click or fill. `sidepanel.js` includes a check to prevent most of these actions on such URLs, returning an error to the controller.
*   **Backend Not Responding / Errors from Controller:**
    *   Verify the `adk api_server` (started by `kick_off_agents.sh`) is running and listening on `0.0.0.0:8000`.
    *   Check the terminal output where you ran `kick_off_agents.sh` for any errors from the ADK server or the agents themselves.
    *   Ensure your `.env` file for the agents is correctly configured.
*   **Chrome Extension Console Logs:**
    *   **Side Panel:** Right-click within the side panel and select \"Inspect\" to open DevTools for `sidepanel.js`.
    *   **Service Worker:** Go to `chrome://extensions`, find the \"LLM Web Use\" extension, and click the \"service worker\" link to open its DevTools.
    These consoles will show errors and `console.log` messages from the extension scripts.