const backendUrl = "http://0.0.0.0:8000/run";

let isControllerActive = false; // State variable for controller loop
const controllerAppName = "browser_controller";
const controllerUserId = "u_123"; // Match backend expectations
const controllerSessionId = "s_123"; // Match backend expectations

// Keep the conversation history (excluding the current message) so the backend can keep context.
// Each item: { role: 'user' | 'assistant', text: string, screenshotDataUrl?: string }
// let history = []; // Remove history

const chatContainer = document.getElementById("chat-container");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const actionModeToggle = document.getElementById("action-mode-toggle");

// Utility to append a message to the chat UI.
function appendMessage(role, text) {
  const div = document.createElement("div");
  div.classList.add("message", role);
  div.textContent = text;
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function captureScreenshot() {
  try {
    // Always get the active tab to know which window to capture.
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) {
      console.warn("Screenshot failed: No active tab found in current window.");
      return null;
    }

    return await new Promise((resolve) => {
      chrome.tabs.captureVisibleTab(activeTab.windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.warn("Screenshot failed:", chrome.runtime.lastError);
          resolve(null); // Continue without screenshot
        } else {
          resolve(dataUrl);
        }
      });
    });
  } catch (err) {
    console.warn("Unable to query active tab for screenshot:", err);
    return null;
  }
}

// Function to be injected into the target page to draw a bounding box.
// This version remains in sidepanel.js as it's used by the "show_element" author locally.
function drawBoundingBox(bboxData) {
    // Remove any existing bounding box
    const existingBox = document.getElementById('ai_assistant_bbox');
    if (existingBox) {
        existingBox.remove();
    }
    
    const box = document.createElement('div');
    box.id = 'ai_assistant_bbox';
    box.style.position = 'fixed';
    box.style.border = '3px solid red';
    box.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
    box.style.zIndex = '2147483647'; // Max z-index 
    box.style.pointerEvents = 'none'; // Allow clicking through the box
    console.log(window.innerHeight, window.innerWidth);
    // Coordinates are normalized (0-1000). Convert to pixels using page's dimensions.
    const ymin = (bboxData.ymin / 1000) * window.innerHeight;
    const xmin = (bboxData.xmin / 1000) * window.innerWidth;
    const ymax = (bboxData.ymax / 1000) * window.innerHeight;
    const xmax = (bboxData.xmax / 1000) * window.innerWidth;
    
    box.style.top = `${ymin}px`;
    box.style.left = `${xmin}px`;
    box.style.width = `${Math.max(0, xmax - xmin)}px`; // Ensure width is not negative
    box.style.height = `${Math.max(0, ymax - ymin)}px`; // Ensure height is not negative

    document.body.appendChild(box);
}

// --- Helper Functions for Controller Interaction ---

// Executes the appropriate browser action based on the controller agent's response
async function executeControllerAction(author, actionData) {
    let result = { success: false, error: "Unknown action or setup failed" };
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || !activeTab.id) {
            throw new Error("Could not find active tab for controller action.");
        }

        console.log(`Injecting and executing action for author: ${author}`, actionData);

        // First, ensure our action script is injected
        // Note: If already injected, Chrome might not re-inject or might re-run it.
        // For simplicity, we inject each time. More advanced would be to check if already present.
        try {
            // Log the URL of the tab we are about to inject into
            try {
                const tabInfo = await chrome.tabs.get(activeTab.id);
                console.log(`Attempting to inject script into tabId: ${activeTab.id}, URL: ${tabInfo.url}, Status: ${tabInfo.status}`);
            } catch (e) {
                console.warn(`Could not get tab info for tabId ${activeTab.id} before injection:`, e);
            }

            await chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                files: ['browser_actions.js'] 
            });
            console.log("browser_actions.js injected successfully.");
        } catch (injectionError) {
            console.error("Failed to inject browser_actions.js:", injectionError);
            throw new Error(`Failed to inject action script: ${injectionError.message}`);
        }
        
        let targetFunctionName = null;
        if (author === "navigate_agent") {
            console.log('VERIFY URL for tabs.update:', JSON.stringify(actionData.url), typeof actionData.url);
            // The user rejected the promise-based wait for navigation, reverting to simple update.
            // The inherent delay before next screenshot + controller call might be enough for many cases.
            // If not, specific handling for navigation completion will be needed again.
            await chrome.tabs.update(activeTab.id, { url: actionData.url });
            result = { success: true, info: "Navigation initiated via tabs.update" };
        } else if (author === "click_agent") {
            targetFunctionName = "pagePerformClick";
        } else if (author === "fill_agent") {
            targetFunctionName = "pagePerformFill";
        } else if (author === "scroll_agent") {
            targetFunctionName = "pagePerformScroll";
        } else if (author === "information_gather_agent") {
            // This agent processes information provided in actionData.
            // No direct browser action (like click/fill) is performed on the page by sidepanel for this.
            // The "action" is acknowledging the info and it will be sent back to the controller.
            if (actionData && typeof actionData.information === 'string') {
                result = { success: true, gatheredInfo: actionData.information, info: "Information processed by sidepanel for controller." };
            } else {
                console.warn("information_gather_agent event missing 'information' string in actionData:", actionData);
                result = { success: false, error: "Information gather event from controller was missing 'information' text." };
            }
            // No targetFunctionName, so script execution for it will be skipped.
        }

        if (targetFunctionName) {
            const scriptResults = await chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: (functionName, data) => {
                    // Check if the function exists on window object after injection
                    if (typeof window[functionName] === 'function') {
                        return window[functionName](data);
                    } else {
                        return { success: false, error: `Function ${functionName} not found on page after injection.` };
                    }
                },
                args: [targetFunctionName, actionData],
            });

            if (scriptResults && scriptResults[0] && typeof scriptResults[0].result !== 'undefined') {
                result = scriptResults[0].result;
            } else {
                console.warn(`Action script (${targetFunctionName}) did not return a valid result.`, scriptResults);
                result = { success: false, error: `Script for ${targetFunctionName} failed or no result.` };
            }
        } else if (author !== "navigate_agent" && author !== "information_gather_agent") { 
            // If not navigate, not info_gather, and no target function name, it's an unhandled agent that might expect a script.
             console.error(`No target function or specific handling defined for author: ${author}`);
             result = { success: false, error: `No action defined for author: ${author}` };
        }
        // Note: if author is navigate_agent or information_gather_agent and they succeeded,
        // result is already set, and targetFunctionName is null, so the above else if is skipped.

    } catch (e) {
        console.error(`Error in executeControllerAction (${author}):`, e);
        result.error = e.message || "Error during controller action execution";
    }
    console.log(`Final action result (${author}):`, result);
    return result;
}

// Sends a message to the browser_controller session and returns its response
async function sendToControllerAndGetResponse(partsForController) { // Renamed and logic updated
    const payload = {
        app_name: controllerAppName,
        user_id: controllerUserId,
        session_id: controllerSessionId,
        new_message: {
            role: "user", // Sending updates/results or initial plan to the controller
            parts: partsForController
        }
    };

    console.log("Sending to controller and awaiting response:", JSON.stringify(payload, null, 2));

    try {
        const res = await fetch(backendUrl, { // Use the main /run endpoint
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!res.ok) { // Check if response status is not OK (e.g., 4xx, 5xx)
            const errorText = await res.text();
            console.error("HTTP error from controller:", res.status, errorText);
            // UI feedback and stop loop
            appendMessage("assistant", `⚠️ Error from controller (${res.status}): ${errorText.substring(0,100)}. Stopping.`);
            isControllerActive = false; // Stop the loop
            return null; // Indicate failure
        }

        const responseArray = await res.json(); // Parse JSON response
        console.log("Received response from controller:", responseArray);

        // Validate the response structure
        if (!Array.isArray(responseArray) || responseArray.length === 0) {
            appendMessage("assistant", "⚠️ Empty or invalid response from controller. Stopping.");
            isControllerActive = false; // Stop the loop
            return null; // Indicate failure
        }
        return responseArray; // Return the events array on success

    } catch (e) { // Catch network errors or JSON parsing errors
        console.error("Network error during controller communication:", e);
        appendMessage("assistant", `⚠️ Network error with controller: ${e.message}. Stopping.`);
        isControllerActive = false; // Stop the loop
        return null; // Indicate failure
    }
}

// --- End Helper Functions ---

async function sendMessage() {
  // Prevent user input if controller is active
  if (isControllerActive) {
    console.warn("User input ignored: Controller is active.");
    // Optionally provide feedback to the user in the UI?
    // appendMessage("assistant", "Automation in progress. Please wait...");
    inputEl.value = ""; // Clear input
    return;
  }

  const text = inputEl.value.trim();
  if (!text) return;
  
  // Immediately show the user message in the UI.
  appendMessage("user", text);
  inputEl.value = "";

  // Capture screenshot of the active tab to include with this user message.
  const initialScreenshotDataUrl = await captureScreenshot();
  console.log("Initial screenshot taken");
  // Prepare the payload parts.
  const parts = [{ "text": text }];
  if (initialScreenshotDataUrl) {
    // Remove the "data:" prefix and extract base64 data
    const mimeType = initialScreenshotDataUrl.substring(initialScreenshotDataUrl.indexOf(":") + 1, initialScreenshotDataUrl.indexOf(";"));
    const base64Image = initialScreenshotDataUrl.split(',')[1];
    parts.push({
      "inline_data": {
        "mime_type": mimeType, // e.g., "image/png"
        "data": base64Image
      }
    });
  }

  // This is the payload for the initial user message to the browser_chat app
  const initialPayload = {
    "app_name": "browser_chat", // User updated this
    "user_id": controllerUserId, // Using shared IDs for simplicity now
    "session_id": controllerSessionId, // Using shared IDs for simplicity now
    "new_message": {
      "role": "user",
      "parts": parts
    }
  };

  // --- Start of Replacement Block ---
  try {
    // This first fetch is for the user's direct message to the browser_chat app
    const initialChatRes = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initialPayload), // This is for the initial user message to browser_chat
    });
    
    if (!initialChatRes.ok) {
        const errorText = await initialChatRes.text();
        throw new Error(`Initial chat request failed: ${initialChatRes.status} ${errorText}`);
    }
    const initialChatResponseArray = await initialChatRes.json();
    console.log("Received from backend (initial chat):", initialChatResponseArray);

    if (!Array.isArray(initialChatResponseArray) || initialChatResponseArray.length === 0) {
        appendMessage("assistant", "(No response or unexpected format from initial chat)");
        return;
    }

    const firstEventFromChat = initialChatResponseArray[initialChatResponseArray.length - 1];
    if (!firstEventFromChat || !firstEventFromChat.author || !firstEventFromChat.content) {
        appendMessage("assistant", "(Invalid event structure from initial chat)");
        return;
    }

    const initialAuthor = firstEventFromChat.author;
    const initialPrimaryText = (firstEventFromChat.content.parts && firstEventFromChat.content.parts.length > 0 && firstEventFromChat.content.parts[0].text) ? firstEventFromChat.content.parts[0].text : null;

    if (initialAuthor === "perform_action") {
        appendMessage("assistant", "🤖 Automation starting... I'll take it from here.");
        isControllerActive = true;
        inputEl.placeholder = "Automation in progress...";
        inputEl.disabled = true;
        sendBtn.disabled = true;

        let nextControllerEvents = null;

        try {
            // 1. Session Management for browser_controller
            const controllerAppBaseUrl = `http://0.0.0.0:8000/apps/${controllerAppName}/users/${controllerUserId}/sessions/${controllerSessionId}`;
            console.log(`Attempting to delete session: ${controllerAppBaseUrl}`);
            // Don't wait for delete, just fire and forget (or check status without await if needed)
            fetch(controllerAppBaseUrl, { method: "DELETE", headers: { "Content-Type": "application/json" } });
            
            // Small delay to allow delete request to potentially process before create
            await new Promise(resolve => setTimeout(resolve, 400)); 

            console.log(`Attempting to create session: ${controllerAppBaseUrl}`);
            const createSessionRes = await fetch(controllerAppBaseUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
            if (!createSessionRes.ok) throw new Error(`Could not start controller session (${createSessionRes.status})`);
            console.log("New controller session started successfully.");

            // 2. Prepare initial payload for browser_controller
            if (!initialPrimaryText) throw new Error("Perform_action event missing plan text.");
            const actionDataFromChat = JSON.parse(initialPrimaryText);
            const { goal_summary, successful_end_state, proposed_action_plan } = actionDataFromChat;
            if (!goal_summary || !successful_end_state || !proposed_action_plan) throw new Error("Incomplete action data from perform_action author.");
            
            const controllerInitParts = [{ text: JSON.stringify({ goal_summary, successful_end_state, proposed_action_plan }) }];
            const initScreenshotUrl = await captureScreenshot();
            console.log("Initial screenshot taken for controller init");
            if (initScreenshotUrl) {
                const mime = initScreenshotUrl.substring(initScreenshotUrl.indexOf(":") + 1, initScreenshotUrl.indexOf(";"));
                const data = initScreenshotUrl.split(',')[1];
                controllerInitParts.push({ "inline_data": { "mime_type": mime, "data": data } });
            }
            
            // 3. First call to controller to get the first action
            console.log("Sending initial plan to controller...");
            nextControllerEvents = await sendToControllerAndGetResponse(controllerInitParts);

        } catch (e) { // Catch errors during controller setup
            console.error("Error initiating controller action:", e);
            appendMessage("assistant", `Error starting automation: ${e.message}`);
            isControllerActive = false; // Ensure loop doesn't start
        }


        // 4. THE MAIN CONTROLLER LOOP
        while (isControllerActive && nextControllerEvents && nextControllerEvents.length > 0) {
            const currentEvent = nextControllerEvents[nextControllerEvents.length - 1];
            const currentAuthor = currentEvent.author;
            const currentText = (currentEvent.content && currentEvent.content.parts && currentEvent.content.parts.length > 0 && currentEvent.content.parts[0].text) ? currentEvent.content.parts[0].text : null;

            // It's possible controller returns an error object directly in the event
            const currentError = (currentEvent.content && currentEvent.content.parts && currentEvent.content.parts.length > 0 && currentEvent.content.parts[0].error) 
                                ? currentEvent.content.parts[0].error 
                                : (currentEvent.error ? currentEvent.error : null);

            if (currentError) {
                 appendMessage("assistant", `⚠️ Controller returned error: ${currentError}. Stopping.`);
                 isControllerActive = false;
                 break;
            }

            if (!currentAuthor || !currentText) {
                // Handle cases where maybe the controller sends non-text (e.g., just status)
                // For now, assume text is required for actions
                if (currentAuthor !== 'concluding_agent') { // concluding_agent might have empty text? 
                    appendMessage("assistant", `⚠️ Invalid event structure from controller (author: ${currentAuthor}). Stopping.`);
                    isControllerActive = false;
                    break;
                }
            }
            
            if (currentAuthor === "concluding_agent") {
                appendMessage("assistant", `✅ Automation finished: ${currentText || '(No concluding message provided)'}`);
                isControllerActive = false; // Stops the loop
                // UI reset will happen after the loop
            } else if (["navigate_agent", "click_agent", "fill_agent", "scroll_agent", "information_gather_agent"].includes(currentAuthor)) {
                let actionSucceeded = false;
                let actionError = "Unknown reason";
                let actionDataForMessage = {}; // To hold parsed actionData for reporting
                let gatheredInfoForController = null;

                try {
                    // For info_gather, currentText might be the JSON containing actionData.information.
                    // For other agents, currentText is the JSON of their specific actionData (e.g., {url:...} or {xmin:...})
                    if (!currentText && currentAuthor !== "information_gather_agent") { // Info_gather might have its data directly in actionData from controller
                        throw new Error(`Missing action data text for ${currentAuthor}`);
                    }
                    // actionDataFromController is the full JSON string for the current action from the controller.
                    // For info_gather, this might be like: {"information": "User is on google.com"}
                    // For click, it might be like: {"xmin": ...}
                    actionDataForMessage = currentText ? JSON.parse(currentText) : {}; 

                    if (currentAuthor === "information_gather_agent") {
                        // The actual "action" for info_gather is just acknowledging it.
                        // The data is already in actionDataForMessage.information
                        if (actionDataForMessage && typeof actionDataForMessage.information === 'string') {
                            appendMessage("assistant", `ℹ️ Info gathered: ${actionDataForMessage.information.substring(0, 100)}${actionDataForMessage.information.length > 100 ? '...' : ''}`);
                            actionSucceeded = true;
                            gatheredInfoForController = actionDataForMessage.information; // This will be sent back
                        } else {
                            actionError = "Information gather event missing 'information' field.";
                            appendMessage("assistant", `⚠️ ${actionError}`);
                        }
                    } else {
                        // For navigate, click, fill, scroll
                        appendMessage("assistant", `🤖 Performing: ${currentAuthor.replace('_agent', '')}...`);
                        const actionResult = await executeControllerAction(currentAuthor, actionDataForMessage);
                        if (actionResult && actionResult.success) {
                            actionSucceeded = true;
                            // If executeControllerAction itself had gatheredInfo (though not typical for these actions)
                            if (actionResult.gatheredInfo) gatheredInfoForController = actionResult.gatheredInfo;
                        } else {
                            actionError = actionResult?.error || actionError;
                            appendMessage("assistant", `⚠️ Action ${currentAuthor.replace('_agent', '')} failed: ${actionError}. Reporting to controller.`);
                        }
                    }
                } catch (e) { 
                    console.error(`Critical error during action execution setup for ${currentAuthor}:`, e);
                    actionError = e.message || "Critical execution setup error";
                    appendMessage("assistant", `⚠️ Action ${currentAuthor.replace('_agent', '')} critically failed: ${actionError}. Reporting to controller.`);
                }

                // Always capture screenshot and send update to controller
                console.log(`Action ${currentAuthor} attempt finished. Capturing screenshot...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); 
                const latestScreenshotUrl = await captureScreenshot();
                
                let messageToControllerText = "";
                if (actionSucceeded) {
                    if (currentAuthor === "information_gather_agent") {
                        messageToControllerText = `ℹ️ Information processed and acknowledged by sidepanel. Gathered info: "${gatheredInfoForController ? gatheredInfoForController.substring(0,150) : 'N/A'}${gatheredInfoForController && gatheredInfoForController.length > 150 ? '...': ''}". Here is the current page state.`;
                    } else {
                        messageToControllerText = `🤖 Action ${currentAuthor.replace('_agent', '')} performed successfully. Here is the current page state.`;
                    }
                } else {
                    messageToControllerText = `⚠️ Action ${currentAuthor.replace('_agent', '')} failed. Reason: ${actionError}.`;
                    if (currentAuthor === 'click_agent' || currentAuthor === 'fill_agent') {
                        messageToControllerText += " The intended interaction area is highlighted in red.";
                    }
                    messageToControllerText += " Here is the current page state.";
                }

                const controllerUpdateParts = [{ "text": messageToControllerText }];

                if (latestScreenshotUrl) {
                    const mime = latestScreenshotUrl.substring(latestScreenshotUrl.indexOf(":") + 1, latestScreenshotUrl.indexOf(";"));
                    const data = latestScreenshotUrl.split(',')[1];
                    controllerUpdateParts.push({ "inline_data": { "mime_type": mime, "data": data } });
                } else {
                    console.warn("Failed to capture screenshot after action attempt. Sending report without it.");
                    controllerUpdateParts[0].text += " (Screenshot capture failed)."
                }
                
                nextControllerEvents = await sendToControllerAndGetResponse(controllerUpdateParts);
                if (!nextControllerEvents) { 
                    isControllerActive = false; 
                }
            } else {
                // Handle unexpected authors returned by the controller during the loop
                appendMessage("assistant", `System: Received unexpected event author '${currentAuthor}' from controller. Stopping.`);
                isControllerActive = false; // Stops the loop
            }
        } // End while(isControllerActive)

        // --- Post-Loop UI Reset ---
        // This runs when the loop finishes naturally (concluding_agent) or is broken by errors/failures
        console.log("Controller loop finished. Resetting UI.");
        inputEl.placeholder = "Type a message…";
        inputEl.disabled = false;
        sendBtn.disabled = false;
        if (isControllerActive) { // Should be false, but double-check
            console.warn("Loop exited but isControllerActive is still true? Forcing false.");
            isControllerActive = false; 
        }
        // --- End Post-Loop UI Reset ---

    } else if (initialAuthor === "show_element") {
        // Handle bounding box drawing - this runs if the *initial* chat response was show_element
        if (initialPrimaryText) {
             try {
                const bboxData = JSON.parse(initialPrimaryText);
                if (typeof bboxData.ymin === 'number' && typeof bboxData.xmin === 'number' &&
                    typeof bboxData.ymax === 'number' && typeof bboxData.xmax === 'number') {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (activeTab && activeTab.id) {
                        await chrome.scripting.executeScript({
                            target: { tabId: activeTab.id },
                            func: drawBoundingBox, args: [bboxData],
                        });
                        appendMessage("assistant", "Shown on page.");
                    } else {
                        appendMessage("assistant", "Error: Could not find active tab to draw bounding box.");
                    }
                } else {
                    appendMessage("assistant", "Error: Invalid bounding box data received.");
                }
            } catch (e) {
                appendMessage("assistant", "Error processing bounding box: " + e.message);
            }
        } else {
            appendMessage("assistant", "Error: Bounding box event missing data.");
        }

    } else {
        // Regular chat response when controller is not active and initial response wasn't perform_action/show_element
        let regularReply = initialPrimaryText || "(No text in response)";
        // Check for errors directly in the first event
        const initialError = (firstEventFromChat.content.parts && firstEventFromChat.content.parts.length > 0 && firstEventFromChat.content.parts[0].error) 
                             ? firstEventFromChat.content.parts[0].error 
                             : (firstEventFromChat.error ? firstEventFromChat.error : null);
        if (initialError) regularReply = `Error: ${initialError}`;
        
        appendMessage("assistant", regularReply);
    }

  } catch (e) { // Outer catch for initial chat fetch, JSON parsing, or major setup errors before controller loop
    console.error("sendMessage - Outer error handler:", e);
    appendMessage("assistant", `Critical error: ${e.message}. Please check console.`);
    // If an error occurs and controller might have been active or was about to be, ensure UI is reset
    if (isControllerActive || inputEl.disabled) { // Check if UI might be in disabled state
        isControllerActive = false;
        inputEl.placeholder = "Type a message…";
        inputEl.disabled = false;
        sendBtn.disabled = false;
    }
  }
  // --- End of Replacement Block ---
}

// Send on button click or Enter key press.
sendBtn.addEventListener("click", sendMessage);
inputEl.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Listen for changes on the action mode toggle
actionModeToggle.addEventListener("change", (event) => {
  const isActionMode = event.target.checked;
  console.log("Action Mode:", isActionMode);
  // TODO: Implement logic based on action mode state
}); 