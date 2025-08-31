// This script will be executed in the context of the current page.

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'fillForm') {
        try {
            const formFields = detectFormFields();
            if (formFields.length === 0) {
                sendResponse({ success: false, message: 'No forms or detectable fields found on this page.' });
                return true; // Keep the message channel open for async response
            }

            // Send form fields and user requirements to the background script for AI processing
            const aiResponse = await chrome.runtime.sendMessage({
                action: 'processFormWithAI',
                fields: formFields,
                requirements: request.requirements
            });

            if (aiResponse && aiResponse.success && aiResponse.filledValues) {
                fillForm(aiResponse.filledValues);
                sendResponse({ success: true, message: 'Form filled with AI suggestions!' });
            } else {
                sendResponse({ success: false, message: aiResponse.message || 'AI failed to provide valid suggestions.' });
            }
        } catch (error) {
            console.error('Error in content.js:', error);
            sendResponse({ success: false, message: `Content script error: ${error.message}` });
        }
        return true; // Keep the message channel open for async response
    }
});

function detectFormFields() {
    const fields = [];
    const formElements = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select');

    formElements.forEach(element => {
        let labelText = '';
        // Try to find an associated label
        if (element.id) {
            const label = document.querySelector(`label[for="${element.id}"]`);
            if (label) {
                labelText = label.textContent.trim();
            }
        }
        // Fallback: check parent elements for text or aria-label
        if (!labelText) {
            const ariaLabel = element.getAttribute('aria-label');
            if (ariaLabel) {
                labelText = ariaLabel.trim();
            }
        }
        if (!labelText && element.parentElement) {
            // Look for text nodes directly preceding the input or within a parent
            const parentText = element.parentElement.textContent.trim();
            if (parentText.length < 100) { // Avoid grabbing too much text
                labelText = parentText;
            }
        }

        fields.push({
            name: element.name,
            id: element.id,
            type: element.type,
            placeholder: element.placeholder,
            label: labelText,
            currentValue: element.value, // Useful for pre-filled fields
            tagName: element.tagName.toLowerCase()
        });
    });
    return fields;
}

function fillForm(aiFilledValues) {
    for (const fieldIdentifier in aiFilledValues) {
        const valueToFill = aiFilledValues[fieldIdentifier];
        let element = document.getElementById(fieldIdentifier) || document.querySelector(`[name="${fieldIdentifier}"]`);

        if (element) {
            if (element.tagName.toLowerCase() === 'select') {
                // For select elements, try to match an option
                const option = Array.from(element.options).find(opt => opt.value === valueToFill || opt.textContent.trim() === valueToFill);
                if (option) {
                    element.value = option.value;
                    // Dispatch change event for frameworks like React/Angular
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else if (element.type === 'radio') {
                // For radio buttons, find the correct one in the group
                const radioGroup = document.querySelectorAll(`input[type="radio"][name="${element.name}"]`);
                radioGroup.forEach(radio => {
                    if (radio.value === valueToFill) {
                        radio.checked = true;
                        radio.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            } else if (element.type === 'checkbox') {
                // For checkboxes, check if the value indicates true/false
                const isChecked = ['true', 'yes', '1'].includes(String(valueToFill).toLowerCase());
                element.checked = isChecked;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // For text, email, number, textarea, etc.
                element.value = valueToFill;
                // Dispatch input/change events for frameworks
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            console.warn(`Could not find element for identifier: ${fieldIdentifier}`);
        }
    }
}
