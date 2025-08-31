// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const analyzeButton = document.getElementById('analyzeButton');
    const fillFormButton = document.getElementById('fillFormButton');
    const cancelButton = document.getElementById('cancelButton');
    const requirementsInput = document.getElementById('requirements');
    const statusDiv = document.getElementById('status');
    const initialSection = document.getElementById('initialSection');
    const reviewSection = document.getElementById('reviewSection');
    const fieldSuggestionsDiv = document.getElementById('fieldSuggestions');

    let currentDetectedFields = []; // To store detected fields for later rendering and filling

    // Function to show status messages
    function showStatus(message, type = '') {
        statusDiv.textContent = message;
        statusDiv.className = type;
        console.log(`Popup Status: ${message} (${type})`); // Log status changes
    }

    // Function to reset UI to initial state
    function resetUI() {
        initialSection.classList.remove('hidden');
        reviewSection.classList.add('hidden');
        fieldSuggestionsDiv.innerHTML = '';
        analyzeButton.disabled = false;
        requirementsInput.disabled = false;
        showStatus('Ready.');
        console.log('Popup UI reset.');
    }

    // Event listener for "Analyze & Suggest" button
    analyzeButton.addEventListener('click', async () => {
        const userRequirements = requirementsInput.value.trim();
        if (!userRequirements) {
            showStatus('Please enter your requirements.', 'error');
            return;
        }

        showStatus('Analyzing form and contacting AI...', '');
        analyzeButton.disabled = true;
        requirementsInput.disabled = true;
        console.log('Analyze button clicked. Sending message to content script.');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error("No active tab found.");
            }
            console.log(`Active tab ID: ${tab.id}`);

            // Execute content.js in the active tab. This ensures it's loaded and ready.
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            console.log('Content script injected into tab.');

            // Send message to content.js to detect fields and get AI suggestions
            const contentResponse = await chrome.tabs.sendMessage(tab.id, {
                action: 'getAISuggestions',
                requirements: userRequirements
            });
            console.log('Received response from content script:', contentResponse);

            // --- CRITICAL FIX: Check if contentResponse is defined ---
            if (!contentResponse) {
                throw new Error('No response from content script. It might have failed to load or respond.');
            }

            if (contentResponse.success && contentResponse.suggestedValues && contentResponse.detectedFields) {
                currentDetectedFields = contentResponse.detectedFields; // Store for later
                renderReviewUI(contentResponse.suggestedValues);
                initialSection.classList.add('hidden');
                reviewSection.classList.remove('hidden');
                showStatus('Review AI suggestions below.', 'success');
            } else {
                showStatus(contentResponse.message || 'AI failed to provide valid suggestions.', 'error');
            }

        } catch (error) {
            console.error('Error in popup.js (analyze):', error);
            showStatus(`Error: ${error.message || 'An unknown error occurred during analysis.'}`, 'error');
        } finally {
            // Only re-enable analyze button if we are still in the initial section
            if (reviewSection.classList.contains('hidden')) { // Check if review section is NOT visible
                analyzeButton.disabled = false;
                requirementsInput.disabled = false;
            }
            // If review section IS visible, buttons remain disabled until user acts
        }
    });

    // Function to render the review UI (no changes needed here, it's robust)
    function renderReviewUI(suggestedValues) {
        fieldSuggestionsDiv.innerHTML = ''; // Clear previous suggestions
        console.log('Rendering review UI with suggested values:', suggestedValues);

        currentDetectedFields.forEach(field => {
            const fieldId = field.id || field.name;
            if (!fieldId) return; // Skip fields without a usable identifier

            const suggestedValue = suggestedValues[fieldId] || '';

            const fieldItem = document.createElement('div');
            fieldItem.className = 'field-item';

            const label = document.createElement('label');
            label.textContent = (field.label || field.placeholder || field.name || field.id || 'Unknown Field') + (field.required ? ' (Required)' : '');
            label.setAttribute('for', `review-${fieldId}`);

            let inputElement;

            if (field.tagName === 'select') {
                if (field.options && field.options.length > 0) {
                    inputElement = document.createElement('select');
                    field.options.forEach(option => {
                        const optElem = document.createElement('option');
                        optElem.value = option.value;
                        optElem.textContent = option.text;
                        inputElement.appendChild(optElem);
                    });
                    inputElement.value = suggestedValue;
                } else {
                    inputElement = document.createElement('input');
                    inputElement.type = 'text';
                    inputElement.value = suggestedValue;
                }
            } else if (field.type === 'radio') {
                inputElement = document.createElement('input');
                inputElement.type = 'text'; // Display as text for editing, actual filling logic handles radios
                inputElement.value = suggestedValue;
            } else if (field.type === 'checkbox') {
                inputElement = document.createElement('input');
                inputElement.type = 'checkbox';
                inputElement.id = `review-${fieldId}`;
                inputElement.setAttribute('data-field-id', fieldId);
                inputElement.checked = ['true', 'yes', '1'].includes(String(suggestedValue).toLowerCase());

                const checkboxLabel = document.createElement('label');
                checkboxLabel.className = 'checkbox-label';
                checkboxLabel.appendChild(inputElement);
                checkboxLabel.appendChild(document.createTextNode(label.textContent));
                fieldItem.appendChild(checkboxLabel);
                fieldSuggestionsDiv.appendChild(fieldItem);
                return;
            } else if (field.tagName === 'textarea') {
                inputElement = document.createElement('textarea');
                inputElement.value = suggestedValue;
            } else {
                inputElement = document.createElement('input');
                inputElement.type = (field.type === 'password' || field.type === 'hidden') ? 'text' : field.type;
                inputElement.value = suggestedValue;
            }

            inputElement.id = `review-${fieldId}`;
            inputElement.setAttribute('data-field-id', fieldId);

            fieldItem.appendChild(label);
            fieldItem.appendChild(inputElement);
            fieldSuggestionsDiv.appendChild(fieldItem);
        });
    }

    // Event listener for "Fill Form" button (after review)
    fillFormButton.addEventListener('click', async () => {
        showStatus('Filling form...', '');
        fillFormButton.disabled = true;
        cancelButton.disabled = true;
        console.log('Fill Form button clicked. Collecting final values.');

        const finalValues = {};
        fieldSuggestionsDiv.querySelectorAll('.field-item input, .field-item textarea, .field-item select').forEach(input => {
            const fieldId = input.getAttribute('data-field-id');
            if (fieldId) {
                if (input.type === 'checkbox') {
                    finalValues[fieldId] = input.checked ? 'true' : 'false';
                } else {
                    finalValues[fieldId] = input.value;
                }
            }
        });
        console.log('Final values to send for filling:', finalValues);

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error("No active tab found.");
            }

            // Send final values to content.js to fill the form
            const contentResponse = await chrome.tabs.sendMessage(tab.id, {
                action: 'fillForm',
                values: finalValues
            });
            console.log('Received response from content script (fillForm):', contentResponse);

            // --- CRITICAL FIX: Check if contentResponse is defined ---
            if (!contentResponse) {
                throw new Error('No response from content script during form filling.');
            }

            if (contentResponse.success) {
                showStatus(contentResponse.message || 'Form filled successfully!', 'success');
            } else {
                showStatus(contentResponse.message || 'Failed to fill form.', 'error');
            }

        } catch (error) {
            console.error('Error in popup.js (fill):', error);
            showStatus(`Error: ${error.message || 'An unknown error occurred during form filling.'}`, 'error');
        } finally {
            fillFormButton.disabled = false;
            cancelButton.disabled = false;
            setTimeout(resetUI, 3000); // Reset after 3 seconds
        }
    });

    // Event listener for "Cancel" button
    cancelButton.addEventListener('click', () => {
        console.log('Cancel button clicked.');
        resetUI();
    });

    // Initial UI setup
    resetUI();
});
