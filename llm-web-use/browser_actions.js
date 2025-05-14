// llm-web-use/browser_actions.js
// This file contains functions intended to be injected into web pages
// to perform browser actions like clicking, filling forms, and scrolling.

let boundingBoxRemoveTimeoutId = null; // Store timeout ID globally within this script

// Draws a bounding box on the page.
// This function is self-contained and designed to be injected.
function drawBoundingBoxOnPage(bboxData) {
    // Clear any existing timeout for a previous box removal
    if (boundingBoxRemoveTimeoutId) {
        clearTimeout(boundingBoxRemoveTimeoutId);
        boundingBoxRemoveTimeoutId = null;
    }

    // Remove any existing bounding box immediately
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

    if (!window.innerHeight || !window.innerWidth) {
        console.warn("drawBoundingBoxOnPage: window dimensions not available.");
        return; // Cannot calculate positions
    }

    const ymin = (bboxData.ymin / 1000) * window.innerHeight;
    const xmin = (bboxData.xmin / 1000) * window.innerWidth;
    const ymax = (bboxData.ymax / 1000) * window.innerHeight;
    const xmax = (bboxData.xmax / 1000) * window.innerWidth;

    box.style.top = `${ymin}px`;
    box.style.left = `${xmin}px`;
    box.style.width = `${Math.max(0, xmax - xmin)}px`;
    box.style.height = `${Math.max(0, ymax - ymin)}px`;

    if (document.body) {
        document.body.appendChild(box);
        // Set a timeout to remove this new box after 3 seconds
        boundingBoxRemoveTimeoutId = setTimeout(() => {
            if (box && box.parentElement) { // Check if box still exists and is in DOM
                box.remove();
            }
            boundingBoxRemoveTimeoutId = null; // Clear the ID after execution
        }, 3000); // 3000 milliseconds = 3 seconds
    } else {
        console.warn("drawBoundingBoxOnPage: document.body not available.");
    }
}

// Finds an element on the page based on bounding box data.
// If isFillTask is true, it only considers fillable elements.
function findElementByBboxOnPage(bboxData, isFillTask = false) {
    drawBoundingBoxOnPage(bboxData); // Visualization

    if (!window.innerHeight || !window.innerWidth) {
        console.warn("findElementByBboxOnPage: window dimensions not available.");
        return null; 
    }

    const yCenter = (bboxData.ymin + bboxData.ymax) / 2 / 1000 * window.innerHeight;
    const xCenter = (bboxData.xmin + bboxData.xmax) / 2 / 1000 * window.innerWidth;
    let minDistance = Infinity;
    let closestElement = null;

    document.querySelectorAll('*:not(script):not(style):not(noscript):not(link):not(meta)').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0') {
            return;
        }

        // If it's a fill task, element must meet fillable criteria (OR logic)
        if (isFillTask) {
            const isFillableTag = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
            const isActuallyEditable = el.isContentEditable;
            if (!(isFillableTag || isActuallyEditable)) {
                return; // Does not meet fillable criteria for this task
            }
        }
        // For non-fill tasks (e.g., click), no specific tag/type filtering is applied here by default.
        // It finds the closest geometrically matching visible element.
        
        const elCenterY = rect.top + rect.height / 2;
        const elCenterX = rect.left + rect.width / 2;
        const distance = Math.sqrt(Math.pow(elCenterY - yCenter, 2) + Math.pow(elCenterX - xCenter, 2));

        const tolerance = 4; 
        const elYMin = rect.top;
        const elXMin = rect.left;
        const elYMax = rect.bottom;
        const elXMax = rect.right;

        const bboxViewportYMin = bboxData.ymin / 1000 * window.innerHeight;
        const bboxViewportXMin = bboxData.xmin / 1000 * window.innerWidth;
        const bboxViewportYMax = bboxData.ymax / 1000 * window.innerHeight;
        const bboxViewportXMax = bboxData.xmax / 1000 * window.innerWidth;

        const withinBounds = elYMin >= (bboxViewportYMin / tolerance) && elXMin >= (bboxViewportXMin / tolerance) &&
                             elYMax <= (bboxViewportYMax * tolerance) && elXMax <= (bboxViewportXMax * tolerance);

        if (withinBounds && distance < minDistance) {
            minDistance = distance;
            closestElement = el;
        }
    });
    return closestElement;
}

// Performs a click at the center of the bboxData by dispatching a MouseEvent.
// To be called after this script is injected.
function pagePerformClick(bboxData) {
    try {
        drawBoundingBoxOnPage(bboxData); // For visualization

        // bboxData provides ymin, xmin, ymax, xmax normalized 0-1000
        const centerXNormalized = (bboxData.xmin + bboxData.xmax) / 2;
        const centerYNormalized = (bboxData.ymin + bboxData.ymax) / 2;

        if (!window.innerHeight || !window.innerWidth) {
            console.warn("pagePerformClick: window dimensions not available for coordinate calculation.");
            return { success: false, error: "Window dimensions not available" };
        }

        // Convert normalized 0-1000 coordinates to viewport pixels
        const viewportX = (centerXNormalized / 1000) * window.innerWidth;
        const viewportY = (centerYNormalized / 1000) * window.innerHeight;

        console.log(`Attempting click at viewport coordinates: X=${viewportX}, Y=${viewportY}`);

        // Using a timeout as per your example, though immediate dispatch is also possible.
        // The timeout might help ensure the page has processed the bbox drawing visually if needed.
        setTimeout(() => {
            try {
                const element = document.elementFromPoint(viewportX, viewportY);
                if (element) {
                    console.log("Element found at coordinates for click:", element);
                    const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: viewportX,
                        clientY: viewportY
                    });
                    element.dispatchEvent(clickEvent);
                    console.log("Click event dispatched on element:", element);
                    
                    // Optionally, try to remove the visual bounding box after the click
                    // const boxToRemove = document.getElementById('ai_assistant_bbox');
                    // if (boxToRemove) boxToRemove.remove();
                    // Note: drawBoundingBoxOnPage already removes existing box, so the next draw will clear it.
                    // If we want it removed *immediately* after this click and before next draw, uncomment above.

                } else {
                    console.warn("No element found at coordinates:", viewportX, viewportY);
                    // We could still try a generic document click here if no element, but it's less targeted.
                    // For now, if no element, consider it a failure for targeted click.
                }
            } catch (e) {
                // This inner catch is for errors during the setTimeout callback (event dispatch, elementFromPoint)
                console.error("Error during delayed click dispatch:", e.message || String(e));
                // This result won't be directly returned by pagePerformClick due to async setTimeout
                // The outer function will have already returned success:true if it reached here.
            }
        }, 100); // Reduced delay from 1000ms to 100ms, adjust as needed

        // Because of setTimeout, this function will return before the click actually happens.
        // This might be an issue for the controller loop if it expects immediate confirmation.
        // For a truly synchronous-behaving click, we'd avoid setTimeout for the dispatch itself
        // or use a Promise that resolves after the click logic in setTimeout.
        // However, for now, following the structure of the request.
        // Let's make it resolve via a promise to better signal completion/failure to the caller.
        return new Promise((resolve) => {
            setTimeout(() => {
                try {
                    const element = document.elementFromPoint(viewportX, viewportY);
                    if (element) {
                        console.log("Element found at coordinates for click (Promise):", element);
                        const clickEvent = new MouseEvent('click', {
                            view: window, bubbles: true, cancelable: true, clientX: viewportX, clientY: viewportY
                        });
                        element.dispatchEvent(clickEvent);
                        console.log("Click event dispatched on element (Promise):", element);
                        // The box will be removed by the next call to drawBoundingBoxOnPage
                        resolve({ success: true });
                    } else {
                        console.warn("No element found at coordinates (Promise):", viewportX, viewportY);
                        resolve({ success: false, error: "No element found at click coordinates" });
                    }
                } catch (e) {
                    console.error("Error during delayed click dispatch (Promise):", e.message || String(e));
                    resolve({ success: false, error: `Click dispatch error: ${e.message || String(e)}` });
                }
            }, 100); // 100ms delay, adjust if needed
        });

    } catch (e) {
        // This outer catch is for errors in initial setup before setTimeout
        console.error("Error in pagePerformClick setup:", e.message || String(e));
        return Promise.resolve({ success: false, error: `Click setup failed: ${e.message || String(e)}` });
    }
}

// Fills a form field identified by fillData (bbox and value).
// To be called after this script is injected.
function pagePerformFill(fillData) {
    try {
        // For filling, isFillTask is true
        const element = findElementByBboxOnPage(fillData, true); 

        if (element) {
            // The element found is guaranteed to be fillable by findElementByBboxOnPage
            element.focus();
            element.value = fillData.field_value; 
            element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            element.blur();
            return { success: true };
        } else {
            return { success: false, error: "Fillable element (Input, Textarea, or contentEditable) not found for fill" };
        }
    } catch (e) {
        return { success: false, error: `Fill failed: ${e.message || String(e)}` };
    }
}

// Scrolls the page based on scrollData.
// To be called after this script is injected.
function pagePerformScroll(scrollData) {
    try {
        if (typeof scrollData.relative_amount !== 'number') {
             return { success: false, error: "Invalid scroll_data: relative_amount missing or not a number." };
        }
        const scrollAmount = scrollData.relative_amount * window.innerHeight;
        window.scrollBy(0, scrollAmount);
        return { success: true };
    } catch (e) {
        return { success: false, error: `Scroll failed: ${e.message || String(e)}` };
    }
} 