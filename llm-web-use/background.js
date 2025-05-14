// Listen for the browser action (toolbar icon) click and open the side panel for the current tab.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    // Some Chrome versions require enabling the side panel via setOptions first
    try {
      await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true });
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (innerErr) {
      console.error('Failed to open side panel:', innerErr);
    }
  }
}); 