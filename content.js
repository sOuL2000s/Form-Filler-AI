// content.js
// This script will be executed in the context of the current page.

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    console.log('Content script received message:', request.action, 'from sender:', sender); // Debugging line

    // IMPORTANT: Return true to indicate that sendResponse will be called asynchronously.
    // This prevents the message channel from closing prematurely.
    const handleAsyncResponse = async () => {
        if (request.action === 'getAISuggestions') {
            try {
                const formFields = detectFormFields();
                if (formFields.length === 0) {
                    console.warn('Content script: No forms or detectable fields found on this page.');
                    sendResponse({ success: false, message: 'No forms or detectable fields found on this page.' });
                    return; // Exit async handler
                }
                console.log('Content script: Detected form fields:', formFields);

                // Send form fields and user requirements to the background script for AI processing
                const aiResponse = await chrome.runtime.sendMessage({
                    action: 'processFormWithAI',
                    fields: formFields,
                    requirements: request.requirements
                });
                console.log('Content script: Received AI response from background:', aiResponse);

                // --- CRITICAL FIX: Ensure aiResponse is valid before proceeding ---
                if (!aiResponse) {
                    console.error('Content script: AI processing failed: No response from background script.');
                    sendResponse({ success: false, message: 'AI processing failed: No response from background script.' });
                    return;
                }

                if (aiResponse.success && aiResponse.filledValues) {
                    console.log('Content script: AI suggestions received, sending to popup.');
                    // Send detected fields AND AI suggestions back to popup for review
                    sendResponse({
                        success: true,
                        message: 'AI suggestions received.',
                        suggestedValues: aiResponse.filledValues,
                        detectedFields: formFields // Send back detected fields for popup to render
                    });
                } else {
                    console.error('Content script: AI failed to provide valid suggestions:', aiResponse.message);
                    sendResponse({ success: false, message: aiResponse.message || 'AI failed to provide valid suggestions.' });
                }
            } catch (error) {
                console.error('Content script error (getAISuggestions):', error);
                sendResponse({ success: false, message: `Content script error: ${error.message}` });
            }
        } else if (request.action === 'fillForm') {
            console.log('Content script: Received fillForm request with values:', request.values);
            try {
                fillForm(request.values);
                console.log('Content script: Form filled successfully, sending success to popup.');
                sendResponse({ success: true, message: 'Form filled successfully!' });
            } catch (error) {
                console.error('Content script error (fillForm):', error);
                sendResponse({ success: false, message: `Error filling form: ${error.message}` });
            }
        } else {
            console.warn('Content script: Unknown action received:', request.action);
            sendResponse({ success: false, message: `Unknown action: ${request.action}` });
        }
    };

    handleAsyncResponse(); // Execute the async handler
    return true; // Crucial: Keep the message channel open for the async response
});

function detectFormFields() {
    const fields = [];
    const formElements = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select');

    formElements.forEach(element => {
        let labelText = '';
        let options = [];

        if (element.id) {
            const label = document.querySelector(`label[for="${element.id}"]`);
            if (label) {
                labelText = label.textContent.trim();
            }
        }
        if (!labelText) {
            const ariaLabel = element.getAttribute('aria-label');
            if (ariaLabel) {
                labelText = ariaLabel.trim();
            } else {
                const ariaLabelledby = element.getAttribute('aria-labelledby');
                if (ariaLabelledby) {
                    const labelElement = document.getElementById(ariaLabelledby);
                    if (labelElement) {
                        labelText = labelElement.textContent.trim();
                    }
                }
            }
        }
        if (!labelText && element.placeholder) {
            labelText = element.placeholder.trim();
        }
        if (!labelText) {
            let prevSibling = element.previousSibling;
            while (prevSibling) {
                if (prevSibling.nodeType === Node.TEXT_NODE && prevSibling.textContent.trim().length > 0) {
                    labelText = prevSibling.textContent.trim();
                    break;
                }
                prevSibling = prevSibling.previousSibling;
            }
        }
        if (!labelText && element.parentElement) {
            const parentText = element.parentElement.textContent.trim();
            if (parentText.length > 0 && parentText.length < 150 && (parentText.includes(element.name || '') || parentText.includes(element.id || ''))) {
                labelText = parentText;
            }
        }
        if (!labelText) {
            labelText = element.name || element.id || '';
        }

        if (element.tagName.toLowerCase() === 'select') {
            options = Array.from(element.options).map(opt => ({
                text: opt.textContent.trim(),
                value: opt.value
            }));
        } else if (element.type === 'radio' && element.name) {
            const radioGroup = document.querySelectorAll(`input[type="radio"][name="${element.name}"]`);
            options = Array.from(radioGroup).map(radio => ({
                text: radio.labels[0]?.textContent.trim() || radio.value,
                value: radio.value
            }));
        }

        fields.push({
            name: element.name,
            id: element.id,
            type: element.type,
            placeholder: element.placeholder,
            label: labelText,
            currentValue: element.value,
            tagName: element.tagName.toLowerCase(),
            required: element.required,
            readOnly: element.readOnly,
            minLength: element.minLength,
            maxLength: element.maxLength,
            pattern: element.pattern,
            options: options.length > 0 ? options : undefined
        });
    });
    return fields;
}

function fillForm(aiFilledValues) {
    console.log('Content script: Attempting to fill form with values:', aiFilledValues);
    for (const fieldIdentifier in aiFilledValues) {
        const valueToFill = aiFilledValues[fieldIdentifier];
        let element = document.getElementById(fieldIdentifier) || document.querySelector(`[name="${fieldIdentifier}"]`);

        if (element) {
            console.log(`Content script: Filling field '${fieldIdentifier}' (type: ${element.type}, tag: ${element.tagName}) with value: '${valueToFill}'`);
            if (element.tagName.toLowerCase() === 'select') {
                const option = Array.from(element.options).find(opt => opt.value === valueToFill || opt.textContent.trim() === valueToFill);
                if (option) {
                    element.value = option.value;
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    console.warn(`Content script: Select field '${fieldIdentifier}' could not find option for value: '${valueToFill}'. Attempting direct fill.`);
                    element.value = valueToFill;
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else if (element.type === 'radio') {
                const radioGroup = document.querySelectorAll(`input[type="radio"][name="${element.name}"]`);
                let found = false;
                radioGroup.forEach(radio => {
                    if (radio.value === valueToFill) {
                        radio.checked = true;
                        radio.dispatchEvent(new Event('change', { bubbles: true }));
                        found = true;
                    }
                });
                if (!found) {
                    console.warn(`Content script: Radio group '${element.name}' could not find option for value: '${valueToFill}'`);
                }
            } else if (element.type === 'checkbox') {
                const isChecked = ['true', 'yes', '1'].includes(String(valueToFill).toLowerCase());
                element.checked = isChecked;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                element.value = valueToFill;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            console.warn(`Content script: Could not find element for identifier: ${fieldIdentifier}`);
        }
    }
}
