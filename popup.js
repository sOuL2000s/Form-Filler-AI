document.addEventListener('DOMContentLoaded', () => {
    const fillFormButton = document.getElementById('fillFormButton');
    const requirementsInput = document.getElementById('requirements');
    const statusDiv = document.getElementById('status');

    fillFormButton.addEventListener('click', async () => {
        const userRequirements = requirementsInput.value.trim();
        if (!userRequirements) {
            statusDiv.textContent = 'Please enter your requirements.';
            statusDiv.className = 'error';
            return;
        }

        statusDiv.textContent = 'Analyzing form and contacting AI...';
        statusDiv.className = '';
        fillFormButton.disabled = true;

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                throw new Error("No active tab found.");
            }

            // Execute content.js in the active tab
            const response = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            // Send a message to the content script (which is now loaded)
            // The content script will then send data to background.js
            const contentResponse = await chrome.tabs.sendMessage(tab.id, {
                action: 'fillForm',
                requirements: userRequirements
            });

            if (contentResponse && contentResponse.success) {
                statusDiv.textContent = contentResponse.message || 'Form filled successfully!';
                statusDiv.className = 'success';
            } else {
                statusDiv.textContent = contentResponse.message || 'Failed to fill form.';
                statusDiv.className = 'error';
            }

        } catch (error) {
            console.error('Error in popup.js:', error);
            statusDiv.textContent = `Error: ${error.message || 'An unknown error occurred.'}`;
            statusDiv.className = 'error';
        } finally {
            fillFormButton.disabled = false;
        }
    });
});
